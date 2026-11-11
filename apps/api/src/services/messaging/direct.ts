import {
  listMessagingAdmins,
  listMessagingProfiles,
  listSharedMessagingCohorts,
  mentorPairAssigned,
  type MessagingProfile
} from '@cio/db/queries/messaging';
import { ROLE } from '@cio/utils/constants';
import { AppError } from '@api/utils/errors';
import {
  decideDirectMessage,
  directChannelId,
  directMessageDenyCode,
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
  const staff = await listMessagingAdmins(organizationId);
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
    staff: staff.map((profile) => participant(profile, profile.profileId))
  });

  if (!decision.allowed) {
    throw deny(decision.reason);
  }

  const channelId = directChannelId(decision.channelType, requesterId, targetId);
  const known = new Map<string, MessagingProfile>();

  for (const profile of [...profiles, ...staff]) {
    known.set(profile.profileId, profile);
  }

  const members = decision.memberIds.flatMap((profileId) => {
    const profile = known.get(profileId);

    return profile ? [profile] : [];
  });

  await gateway.upsertUsers(members.map(toStreamPerson));

  return gateway.ensureChannel({
    channelType: decision.channelType,
    channelId,
    organizationId,
    name: decision.channelType,
    purpose: decision.channelType,
    createdById: requesterId,
    memberIds: decision.memberIds
  });
}
