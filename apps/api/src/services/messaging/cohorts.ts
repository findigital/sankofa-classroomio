import {
  listAssignedFellows,
  listCohortMessagingSettings,
  listCohortRosters,
  listMessagingAdmins,
  upsertCohortMessagingSetting,
  type CohortMessagingSettingRow,
  type MessagingProfile
} from '@cio/db/queries/messaging';
import { ROLE } from '@cio/utils/constants';
import { AppError, ErrorCodes } from '@api/utils/errors';
import { cohortChannelDisplayName, cohortChannelId, isListedCohortChannel } from '@cio/utils/functions/messaging';

import { assertMessagingAvailable } from './availability';
import { labelDirectChannels, reconcileExistingDirectMessage } from './direct';
import { type MessagingChannelSummary, type StreamGateway, type StreamPerson } from './gateway';

export type DirectCandidate = {
  profileId: string;
  name: string;
  roleId: number;
  isMinor: boolean;
};

function toStreamPerson(profile: MessagingProfile): StreamPerson {
  return {
    id: profile.profileId,
    name: profile.name || profile.profileId,
    ...(profile.avatarUrl ? { image: profile.avatarUrl } : {})
  };
}

function uniqueProfiles(profiles: MessagingProfile[]): MessagingProfile[] {
  const seen = new Map<string, MessagingProfile>();

  for (const profile of profiles) {
    seen.set(profile.profileId, profile);
  }

  return [...seen.values()];
}

/**
 * Creates the announcement and discussion channels for the viewer's cohorts
 * and returns the channels they belong to.
 */
export async function syncCohortChannels(
  organizationId: string,
  profileId: string,
  roleId: number,
  gateway: StreamGateway
): Promise<MessagingChannelSummary[]> {
  assertMessagingAvailable();

  const rosters = await listCohortRosters(organizationId, roleId === ROLE.ADMIN ? null : profileId);
  const admins = await listMessagingAdmins(organizationId);

  for (const cohort of rosters) {
    const members = uniqueProfiles([...cohort.members, ...admins]);
    const memberIds = members.map((member) => member.profileId);

    if (memberIds.length === 0) continue;

    const createdById = memberIds.includes(profileId) ? profileId : memberIds[0]!;

    await gateway.upsertUsers(members.map(toStreamPerson));

    await gateway.ensureChannel({
      channelType: 'cohort_announcement',
      channelId: cohortChannelId('announcement', cohort.groupId),
      organizationId,
      name: cohortChannelDisplayName(cohort.courseName || cohort.name, 'announcement'),
      purpose: 'announcement',
      cohortId: cohort.groupId,
      createdById,
      memberIds
    });

    await gateway.ensureChannel({
      channelType: 'cohort_discussion',
      channelId: cohortChannelId('discussion', cohort.groupId),
      organizationId,
      name: cohortChannelDisplayName(cohort.courseName || cohort.name, 'discussion'),
      purpose: 'discussion',
      cohortId: cohort.groupId,
      createdById,
      memberIds
    });
  }

  const publishedGroupIds = new Set(rosters.map((cohort) => cohort.groupId));
  const channels = await gateway.queryMemberChannels(profileId, organizationId);

  for (const channel of channels) {
    if (isListedCohortChannel(channel, publishedGroupIds)) continue;

    await gateway.removeChannelMember(channel.channelType, channel.channelId, profileId);
  }
  let reconciledDirectMessage = false;
  const directMembers = new Map<string, string[]>();

  for (const channel of channels) {
    if (channel.purpose !== 'fellow_dm' && channel.purpose !== 'mentor_dm') continue;

    const inspected = await gateway.inspectChannel(channel.channelType, channel.channelId);

    if (!inspected) continue;

    directMembers.set(`${channel.channelType}:${channel.channelId}`, inspected.memberIds);

    const reconciled = await reconcileExistingDirectMessage(
      organizationId,
      inspected.purpose || channel.purpose,
      inspected.memberIds,
      gateway
    );

    reconciledDirectMessage = reconciledDirectMessage || reconciled;
  }

  const visible = reconciledDirectMessage ? await gateway.queryMemberChannels(profileId, organizationId) : channels;
  const named = await labelDirectChannels(organizationId, profileId, visible, gateway, directMembers);
  const courseImages = new Map(
    rosters.flatMap((cohort) => (cohort.courseImage ? [[cohort.groupId, cohort.courseImage] as const] : []))
  );

  return named
    .filter((channel) => isListedCohortChannel(channel, publishedGroupIds))
    .map((channel) => ({
      ...channel,
      image: channel.cohortId ? (courseImages.get(channel.cohortId) ?? null) : null
    }));
}

export async function listDirectCandidates(
  organizationId: string,
  profileId: string,
  roleId: number
): Promise<DirectCandidate[]> {
  assertMessagingAvailable();

  if (roleId === ROLE.TUTOR) {
    const fellows = await listAssignedFellows(organizationId, profileId);

    return fellows.map(toCandidate);
  }

  if (roleId !== ROLE.STUDENT) return [];

  const rosters = await listCohortRosters(organizationId, profileId);
  const people = uniqueProfiles(rosters.flatMap((cohort) => cohort.members)).filter(
    (person) => person.profileId !== profileId && person.roleId === ROLE.STUDENT
  );

  return people.map(toCandidate);
}

function toCandidate(profile: MessagingProfile): DirectCandidate {
  return {
    profileId: profile.profileId,
    name: profile.name,
    roleId: profile.roleId,
    isMinor: profile.isMinor
  };
}

export async function listCohortSettings(organizationId: string): Promise<CohortMessagingSettingRow[]> {
  assertMessagingAvailable();

  return listCohortMessagingSettings(organizationId);
}

export async function setCohortFellowDm(
  organizationId: string,
  groupId: string,
  fellowDmEnabled: boolean,
  actorProfileId: string
): Promise<CohortMessagingSettingRow> {
  assertMessagingAvailable();

  const saved = await upsertCohortMessagingSetting(organizationId, groupId, fellowDmEnabled, actorProfileId);

  if (!saved) {
    throw new AppError('Cohort not found', ErrorCodes.MESSAGING_CHANNEL_NOT_FOUND, 404);
  }

  return saved;
}
