import {
  listMessagingAdmins,
  listMessagingProfiles,
  listSharedMessagingCohorts,
  mentorPairAssigned,
  readSafeguardingStaffIds,
  type MessagingProfile
} from '@cio/db/queries/messaging';
import { ROLE } from '@cio/utils/constants';
import { AppError } from '@api/utils/errors';
import {
  decideDirectMessage,
  directChannelId,
  directMessageDenyCode,
  directMessageDisplayName,
  selectSafeguardingStaff,
  type DirectMessageDenyReason,
  type MessagingParticipant
} from '@cio/utils/functions/messaging';

import { assertMessagingAvailable } from './availability';
import { type MessagingChannelSummary, type StreamGateway, type StreamPerson } from './gateway';

function participant(profile: MessagingProfile | undefined, profileId: string): MessagingParticipant {
  if (!profile) {
    return { profileId, roleId: 0, isMinor: false };
  }

  return { profileId: profile.profileId, roleId: profile.roleId, isMinor: profile.isMinor };
}

function deny(reason: DirectMessageDenyReason): AppError {
  const message =
    reason === 'minor_adult_requires_staff'
      ? 'A staff member must be in any direct message between a minor and an adult'
      : reason === 'mentor_not_assigned'
        ? 'Mentors can only message fellows assigned to them'
        : reason === 'fellow_dm_disabled'
          ? 'Fellow direct messages are turned off for the cohorts you share'
          : reason === 'no_shared_cohort'
            ? 'Fellow direct messages require a shared cohort'
            : 'This conversation is not allowed';

  return new AppError(message, directMessageDenyCode(reason), 403);
}

function toStreamPerson(profile: MessagingProfile): StreamPerson {
  return {
    id: profile.profileId,
    name: profile.name || profile.profileId,
    ...(profile.avatarUrl ? { image: profile.avatarUrl } : {})
  };
}

/**
 * Opens a fellow or mentor direct message.
 * A denied decision does not create a channel or add members.
 */
export async function openDirectMessage(
  organizationId: string,
  requesterId: string,
  targetId: string,
  gateway: StreamGateway
): Promise<MessagingChannelSummary> {
  assertMessagingAvailable();

  const profiles = await listMessagingProfiles(organizationId, [requesterId, targetId]);
  const requester = profiles.find((profile) => profile.profileId === requesterId);
  const target = profiles.find((profile) => profile.profileId === targetId);
  const configuredIds = await readSafeguardingStaffIds(organizationId);
  const admins = await listMessagingAdmins(organizationId);
  const staff = selectSafeguardingStaff({
    configuredIds,
    admins: admins.map((profile) => participant(profile, profile.profileId))
  });
  const shared = await listSharedMessagingCohorts(organizationId, requesterId, targetId);
  const requesterRole = requester?.roleId ?? 0;
  const targetRole = target?.roleId ?? 0;
  let mentorAssigned = false;

  if (
    (requesterRole === ROLE.TUTOR && targetRole === ROLE.STUDENT) ||
    (requesterRole === ROLE.STUDENT && targetRole === ROLE.TUTOR)
  ) {
    const mentorProfileId = requesterRole === ROLE.TUTOR ? requesterId : targetId;
    const fellowProfileId = requesterRole === ROLE.STUDENT ? requesterId : targetId;
    mentorAssigned = await mentorPairAssigned(organizationId, mentorProfileId, fellowProfileId);
  }

  const decision = decideDirectMessage({
    requester: participant(requester, requesterId),
    target: participant(target, targetId),
    sharedCohorts: shared.map((cohort) => ({ fellowDmEnabled: cohort.fellowDmEnabled })),
    mentorAssigned,
    staff
  });

  if (!decision.allowed) {
    throw deny(decision.reason);
  }

  const channelId = directChannelId(decision.channelType, requesterId, targetId);
  const staffIds = new Set(staff.map((person) => person.profileId));
  const known = new Map<string, MessagingProfile>();

  for (const profile of [...profiles, ...admins.filter((profile) => staffIds.has(profile.profileId))]) {
    known.set(profile.profileId, profile);
  }

  const members = decision.memberIds.flatMap((profileId) => {
    const profile = known.get(profileId);

    return profile ? [profile] : [];
  });

  await gateway.upsertUsers(members.map(toStreamPerson));

  const opened = await gateway.ensureChannel({
    channelType: decision.channelType,
    channelId,
    organizationId,
    name: decision.channelType,
    purpose: decision.channelType,
    createdById: requesterId,
    memberIds: decision.memberIds,
    protectedMemberIds: [requesterId, targetId]
  });
  const name = directMessageDisplayName(requesterId, members);

  return name ? { ...opened, name } : opened;
}

/**
 * Replaces direct-message names with the other participant's name for this viewer.
 * Cohort channel names are already the same for everyone.
 */
export async function labelDirectChannels(
  organizationId: string,
  viewerId: string,
  channels: MessagingChannelSummary[],
  gateway: StreamGateway,
  knownMembers: Map<string, string[]> = new Map()
): Promise<MessagingChannelSummary[]> {
  const directChannels = channels.filter(
    (channel) => channel.purpose === 'fellow_dm' || channel.purpose === 'mentor_dm'
  );

  if (directChannels.length === 0) return channels;

  const membersByChannel = new Map(knownMembers);

  for (const channel of directChannels) {
    const key = `${channel.channelType}:${channel.channelId}`;

    if (membersByChannel.has(key)) continue;

    const inspected = await gateway.inspectChannel(channel.channelType, channel.channelId);

    if (!inspected) continue;

    membersByChannel.set(key, inspected.memberIds);
  }

  const profileIds = [...new Set([...membersByChannel.values()].flat())];

  if (profileIds.length === 0) return channels;

  const profiles = await listMessagingProfiles(organizationId, profileIds);
  const profilesById = new Map(profiles.map((profile) => [profile.profileId, profile]));

  return channels.map((channel) => {
    if (channel.purpose !== 'fellow_dm' && channel.purpose !== 'mentor_dm') return channel;

    const memberIds = membersByChannel.get(`${channel.channelType}:${channel.channelId}`);

    if (!memberIds) return channel;

    const people = memberIds.flatMap((profileId) => {
      const profile = profilesById.get(profileId);

      return profile ? [profile] : [];
    });
    const name = directMessageDisplayName(viewerId, people);

    return name ? { ...channel, name } : channel;
  });
}

/**
 * Re-applies direct-message membership for an existing channel.
 * A denied decision leaves the current members in place.
 */
export async function reconcileExistingDirectMessage(
  organizationId: string,
  purpose: string,
  memberIds: string[],
  gateway: StreamGateway
): Promise<boolean> {
  if (purpose !== 'fellow_dm' && purpose !== 'mentor_dm') return false;

  const profiles = await listMessagingProfiles(organizationId, memberIds);
  const participants = profiles.filter((profile) => profile.roleId === ROLE.STUDENT || profile.roleId === ROLE.TUTOR);

  if (participants.length !== 2) return false;

  const first = participants[0];
  const second = participants[1];

  if (!first || !second) return false;

  try {
    await openDirectMessage(organizationId, first.profileId, second.profileId, gateway);
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 403) return false;

    throw error;
  }

  return true;
}
