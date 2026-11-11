import { ErrorCodes, type ErrorCode } from '../constants/error-codes';
import { ROLE } from '../constants/roles';

export const MESSAGING_CHANNEL_TYPES = ['cohort_announcement', 'cohort_discussion', 'fellow_dm', 'mentor_dm'] as const;

export type MessagingChannelType = (typeof MESSAGING_CHANNEL_TYPES)[number];

export const MESSAGING_PURPOSES = ['announcement', 'discussion', 'fellow_dm', 'mentor_dm'] as const;

export type MessagingPurpose = (typeof MESSAGING_PURPOSES)[number];

export const BUILTIN_BLOCKLISTS = [
  { blocklist: 'profanity', behavior: 'block' },
  { blocklist: 'url_detection_v1', behavior: 'block' }
] as const;

export const CLIENT_DENIED_PERMISSIONS = [
  'create-channel',
  'recreate-channel',
  'recreate-channel-owner',
  'update-channel-members',
  'update-channel-members-owner',
  'delete-channel',
  'delete-channel-owner',
  'truncate-channel',
  'truncate-channel-owner',
  'create-message',
  'create-message-owner',
  'update-message',
  'update-message-owner',
  'create-attachment',
  'create-attachment-owner',
  'upload-attachment',
  'upload-attachment-owner'
] as const;

const CLIENT_ROLES = [
  'user',
  'guest',
  'anonymous',
  'admin',
  'moderator',
  'channel_member',
  'channel_moderator'
] as const;

const MEMBER_GRANTS = ['read-channel', 'read-channel-members', 'create-reaction', 'flag-message', 'mute-channel'];

const MODERATOR_GRANTS = [...MEMBER_GRANTS, 'delete-reaction', 'read-message-flags'];

export type ChannelTypeDefinition = {
  name: MessagingChannelType;
  grants: Record<string, string[]>;
};

export type ChannelTypeUpdate = {
  grants: Record<string, string[]>;
  reactions: true;
  replies: true;
  read_events: true;
  typing_events: true;
  mutes: true;
  uploads: false;
  url_enrichment: false;
  search: true;
  max_message_length: number;
  automod: 'disabled';
  blocklists: Array<{ blocklist: string; behavior: 'block' }>;
};

function clientGrants(): Record<string, string[]> {
  const grants: Record<string, string[]> = {};

  for (const role of CLIENT_ROLES) {
    if (role === 'channel_moderator') {
      grants[role] = [...MODERATOR_GRANTS];
    } else if (role === 'channel_member') {
      grants[role] = [...MEMBER_GRANTS];
    } else {
      grants[role] = [];
    }
  }

  return grants;
}

/** Channel types the browser is allowed to read and react in, and nothing else. */
export function channelTypeDefinitions(): ChannelTypeDefinition[] {
  return MESSAGING_CHANNEL_TYPES.map((name) => ({
    name,
    grants: clientGrants()
  }));
}

/** Body sent to Stream when locking a channel type. Built-in blocklists are named here. */
export function channelTypeUpdate(definition: ChannelTypeDefinition): ChannelTypeUpdate {
  return {
    grants: definition.grants,
    reactions: true,
    replies: true,
    read_events: true,
    typing_events: true,
    mutes: true,
    uploads: false,
    url_enrichment: false,
    search: true,
    max_message_length: 5000,
    automod: 'disabled',
    blocklists: BUILTIN_BLOCKLISTS.map((entry) => ({ ...entry }))
  };
}

/** Same label for every viewer: the course title plus Announcements or Discussion. */
export function cohortChannelDisplayName(courseName: string, purpose: 'announcement' | 'discussion'): string {
  const title = courseName.trim();
  const suffix = purpose === 'announcement' ? 'Announcements' : 'Discussion';

  return title ? `${title} ${suffix}` : suffix;
}

/**
 * Name a direct message for one viewer.
 * A participant sees the other participant. Staff see both participants.
 */
export function directMessageDisplayName(
  viewerId: string,
  members: Array<{ profileId: string; roleId: number; name: string }>
): string {
  const participants = members.filter((member) => member.roleId === ROLE.STUDENT || member.roleId === ROLE.TUTOR);
  const others = participants.filter((member) => member.profileId !== viewerId);
  const shown = others.length > 0 ? others : participants;

  return shown
    .map((member) => member.name.trim())
    .filter(Boolean)
    .join(', ');
}

export function cohortChannelId(purpose: 'announcement' | 'discussion', groupId: string): string {
  const prefix = purpose === 'announcement' ? 'ann' : 'dis';

  return `${prefix}${groupId.replace(/-/g, '')}`;
}

function stableDigest(input: string): string {
  const prime = 0x100000001b3n;
  const mask = (1n << 64n) - 1n;
  let left = 0xcbf29ce484222325n;
  let right = 0x84222325cbf29ce4n;

  for (const char of input) {
    const code = BigInt(char.charCodeAt(0));
    left = ((left ^ code) * prime) & mask;
    right = ((right ^ code) * prime) & mask;
  }

  return `${left.toString(16).padStart(16, '0')}${right.toString(16).padStart(16, '0')}`;
}

export function directChannelId(channelType: 'fellow_dm' | 'mentor_dm', profileA: string, profileB: string): string {
  const pair = [profileA, profileB].sort().join(':');
  const prefix = channelType === 'fellow_dm' ? 'fdm' : 'mdm';

  return `${prefix}${stableDigest(`${channelType}:${pair}`)}`;
}

export function organizationBlocklistName(organizationId: string): string {
  return `cio${organizationId.replace(/-/g, '').slice(0, 24)}`;
}

export type MessagingParticipant = {
  profileId: string;
  roleId: number;
  isMinor: boolean;
};

export type DirectMessageDenyReason =
  | 'same_person'
  | 'not_a_member'
  | 'fellow_dm_disabled'
  | 'no_shared_cohort'
  | 'mentor_not_assigned'
  | 'pair_not_allowed'
  | 'minor_adult_requires_staff';

export type DirectMessageDecision =
  | {
      allowed: true;
      channelType: 'fellow_dm' | 'mentor_dm';
      memberIds: string[];
      staffProfileIds: string[];
    }
  | { allowed: false; reason: DirectMessageDenyReason };

const DENY_CODES: Record<DirectMessageDenyReason, ErrorCode> = {
  same_person: ErrorCodes.MESSAGING_FORBIDDEN,
  not_a_member: ErrorCodes.MESSAGING_FORBIDDEN,
  fellow_dm_disabled: ErrorCodes.MESSAGING_FELLOW_DM_DISABLED,
  no_shared_cohort: ErrorCodes.MESSAGING_FELLOW_DM_DISABLED,
  mentor_not_assigned: ErrorCodes.MESSAGING_MENTOR_NOT_ASSIGNED,
  pair_not_allowed: ErrorCodes.MESSAGING_CHANNEL_DENIED,
  minor_adult_requires_staff: ErrorCodes.MESSAGING_MINOR_ADULT_REQUIRES_STAFF
};

export function directMessageDenyCode(reason: DirectMessageDenyReason): ErrorCode {
  return DENY_CODES[reason];
}

function uniqueSorted(ids: string[]): string[] {
  return [...new Set(ids)].sort();
}

const COHORT_CHANNEL_PURPOSES = new Set(['announcement', 'discussion']);

/**
 * Cohort channels are listed only when their course group is published.
 * Direct messages are unchanged.
 */
export function isListedCohortChannel(
  channel: { purpose: string; cohortId: string | null },
  publishedGroupIds: ReadonlySet<string>
): boolean {
  if (!COHORT_CHANNEL_PURPOSES.has(channel.purpose)) return true;

  return channel.cohortId !== null && publishedGroupIds.has(channel.cohortId);
}

/**
 * Picks who is added to an adult–minor direct message.
 * A missing list means every non-minor admin. An empty list adds nobody.
 */
export function selectSafeguardingStaff(input: {
  configuredIds: string[] | null;
  admins: MessagingParticipant[];
}): MessagingParticipant[] {
  const eligible = input.admins.filter((person) => person.roleId === ROLE.ADMIN && !person.isMinor);

  if (input.configuredIds === null) return eligible;

  const allowed = new Set(input.configuredIds);

  return eligible.filter((person) => allowed.has(person.profileId));
}

/**
 * Decides whether two people may open a 1:1.
 * A minor and an adult are allowed only when a non-minor admin is added to the channel.
 */
export function decideDirectMessage(input: {
  requester: MessagingParticipant;
  target: MessagingParticipant;
  sharedCohorts: Array<{ fellowDmEnabled: boolean }>;
  mentorAssigned: boolean;
  staff: MessagingParticipant[];
}): DirectMessageDecision {
  if (input.requester.profileId === input.target.profileId) {
    return { allowed: false, reason: 'same_person' };
  }

  if (input.requester.roleId === 0 || input.target.roleId === 0) {
    return { allowed: false, reason: 'not_a_member' };
  }

  const pair = [input.requester, input.target];
  const tutor = pair.find((person) => person.roleId === ROLE.TUTOR);
  const students = pair.filter((person) => person.roleId === ROLE.STUDENT);
  let channelType: 'fellow_dm' | 'mentor_dm';

  if (students.length === 2) {
    channelType = 'fellow_dm';

    if (input.sharedCohorts.length === 0) {
      return { allowed: false, reason: 'no_shared_cohort' };
    }

    if (!input.sharedCohorts.some((cohort) => cohort.fellowDmEnabled)) {
      return { allowed: false, reason: 'fellow_dm_disabled' };
    }
  } else if (tutor && students.length === 1) {
    channelType = 'mentor_dm';

    if (!input.mentorAssigned) {
      return { allowed: false, reason: 'mentor_not_assigned' };
    }
  } else {
    return { allowed: false, reason: 'pair_not_allowed' };
  }

  const involvesMinorAndAdult = input.requester.isMinor !== input.target.isMinor;

  if (!involvesMinorAndAdult) {
    return {
      allowed: true,
      channelType,
      memberIds: uniqueSorted([input.requester.profileId, input.target.profileId]),
      staffProfileIds: []
    };
  }

  const staffProfileIds = input.staff
    .filter((person) => person.roleId === ROLE.ADMIN && !person.isMinor)
    .map((person) => person.profileId)
    .filter((profileId) => profileId !== input.requester.profileId && profileId !== input.target.profileId);

  if (staffProfileIds.length === 0) {
    return { allowed: false, reason: 'minor_adult_requires_staff' };
  }

  return {
    allowed: true,
    channelType,
    memberIds: uniqueSorted([input.requester.profileId, input.target.profileId, ...staffProfileIds]),
    staffProfileIds: uniqueSorted(staffProfileIds)
  };
}

export type KeywordRule = {
  phrase: string;
  action: 'flag' | 'block';
};

export type KeywordVerdict = { action: 'allow' } | { action: 'flag' | 'block'; phrase: string };

function phraseMatches(text: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');

  return pattern.test(text);
}

/** Block wins over flag. Matching is case-insensitive and does not fire inside a longer word. */
export function reviewMessageText(text: string, keywords: KeywordRule[]): KeywordVerdict {
  let flagged: string | undefined;

  for (const keyword of keywords) {
    const phrase = keyword.phrase.trim();

    if (!phrase || !phraseMatches(text, phrase)) continue;

    if (keyword.action === 'block') {
      return { action: 'block', phrase };
    }

    flagged = flagged ?? phrase;
  }

  if (flagged) {
    return { action: 'flag', phrase: flagged };
  }

  return { action: 'allow' };
}

export function canSendToPurpose(roleId: number, purpose: string): boolean {
  if (purpose === 'announcement') {
    return roleId === ROLE.ADMIN || roleId === ROLE.TUTOR;
  }

  return purpose === 'discussion' || purpose === 'fellow_dm' || purpose === 'mentor_dm';
}

export type TranscriptMessage = {
  id: string;
  text: string;
  userId: string;
  userName: string;
  createdAt: string;
};

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

export function transcriptToJson(messages: TranscriptMessage[]): string {
  return JSON.stringify({ messages }, null, 2);
}

export function transcriptToCsv(messages: TranscriptMessage[]): string {
  const header = 'created_at,user_id,user_name,message_id,text';
  const lines = messages.map((message) =>
    [message.createdAt, message.userId, message.userName, message.id, message.text].map(csvCell).join(',')
  );

  return [header, ...lines].join('\n');
}

export type UnreadDigestPlan = {
  status: 'deferred';
  reason: 'messaging_disabled' | 'smtp_not_configured' | 'delivery_not_implemented';
  delivered: 0;
};

/**
 * Decides whether an unread-message digest may send.
 * Delivery itself is intentionally not implemented until SMTP is configured.
 */
export function planUnreadMessageDigest(input: {
  messagingEnabled: boolean;
  smtpConfigured: boolean;
}): UnreadDigestPlan {
  if (!input.messagingEnabled) {
    return { status: 'deferred', reason: 'messaging_disabled', delivered: 0 };
  }

  if (!input.smtpConfigured) {
    return { status: 'deferred', reason: 'smtp_not_configured', delivered: 0 };
  }

  return { status: 'deferred', reason: 'delivery_not_implemented', delivered: 0 };
}
