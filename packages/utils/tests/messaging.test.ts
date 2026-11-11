import { describe, expect, it } from 'vitest';

import { ROLE } from '../src/constants/roles';
import {
  BUILTIN_BLOCKLISTS,
  CLIENT_DENIED_PERMISSIONS,
  channelTypeDefinitions,
  channelTypeUpdate,
  decideDirectMessage,
  directChannelId,
  planUnreadMessageDigest,
  reviewMessageText,
  transcriptToCsv,
  type MessagingParticipant
} from '../src/functions/messaging';
import { ZOpenDirectMessage } from '../src/validation/messaging';

const ADULT_FELLOW: MessagingParticipant = {
  profileId: '11111111-1111-4111-8111-111111111111',
  roleId: ROLE.STUDENT,
  isMinor: false
};

const MINOR_FELLOW: MessagingParticipant = {
  profileId: '22222222-2222-4222-8222-222222222222',
  roleId: ROLE.STUDENT,
  isMinor: true
};

const MENTOR: MessagingParticipant = {
  profileId: '33333333-3333-4333-8333-333333333333',
  roleId: ROLE.TUTOR,
  isMinor: false
};

const STAFF: MessagingParticipant = {
  profileId: '44444444-4444-4444-8444-444444444444',
  roleId: ROLE.ADMIN,
  isMinor: false
};

describe('channel type grants', () => {
  it('omits channel creation, membership changes, and client sends on every role', () => {
    for (const definition of channelTypeDefinitions()) {
      const update = channelTypeUpdate(definition);

      expect(update.blocklists.map((entry) => entry.blocklist)).toEqual(
        BUILTIN_BLOCKLISTS.map((entry) => entry.blocklist)
      );

      for (const permissions of Object.values(definition.grants)) {
        for (const denied of CLIENT_DENIED_PERMISSIONS) {
          expect(permissions).not.toContain(denied);
        }
      }

      expect(definition.grants.channel_member).toContain('create-reaction');
      expect(definition.grants.user).toEqual([]);
    }
  });
});

describe('decideDirectMessage', () => {
  it('denies an unassigned mentor without calling for a channel', () => {
    const decision = decideDirectMessage({
      requester: MENTOR,
      target: ADULT_FELLOW,
      sharedCohorts: [{ fellowDmEnabled: true }],
      mentorAssigned: false,
      staff: [STAFF]
    });

    expect(decision).toEqual({ allowed: false, reason: 'mentor_not_assigned' });
  });

  it('denies a minor-to-adult direct message when no staff member can be added', () => {
    const decision = decideDirectMessage({
      requester: MENTOR,
      target: MINOR_FELLOW,
      sharedCohorts: [],
      mentorAssigned: true,
      staff: []
    });

    expect(decision).toEqual({ allowed: false, reason: 'minor_adult_requires_staff' });
  });

  it('allows a minor-to-adult direct message only with a staff member in the channel', () => {
    const decision = decideDirectMessage({
      requester: MINOR_FELLOW,
      target: MENTOR,
      sharedCohorts: [],
      mentorAssigned: true,
      staff: [STAFF]
    });

    expect(decision.allowed).toBe(true);

    if (!decision.allowed) return;

    expect(decision.channelType).toBe('mentor_dm');
    expect(decision.memberIds).toContain(STAFF.profileId);
    expect(decision.staffProfileIds).toEqual([STAFF.profileId]);
  });

  it('allows an assigned adult mentor conversation without adding staff', () => {
    const decision = decideDirectMessage({
      requester: MENTOR,
      target: ADULT_FELLOW,
      sharedCohorts: [],
      mentorAssigned: true,
      staff: [STAFF]
    });

    expect(decision.allowed).toBe(true);

    if (!decision.allowed) return;

    expect(decision.memberIds).not.toContain(STAFF.profileId);
  });

  it('lets two minors message without adding a staff member', () => {
    const otherMinor: MessagingParticipant = {
      profileId: '55555555-5555-4555-8555-555555555555',
      roleId: ROLE.STUDENT,
      isMinor: true
    };
    const decision = decideDirectMessage({
      requester: MINOR_FELLOW,
      target: otherMinor,
      sharedCohorts: [{ fellowDmEnabled: true }],
      mentorAssigned: false,
      staff: [STAFF]
    });

    expect(decision.allowed).toBe(true);

    if (!decision.allowed) return;

    expect(decision.staffProfileIds).toEqual([]);
    expect(decision.memberIds).not.toContain(STAFF.profileId);
  });

  it('denies fellow direct messages when the cohort toggle is off', () => {
    const decision = decideDirectMessage({
      requester: ADULT_FELLOW,
      target: MINOR_FELLOW,
      sharedCohorts: [{ fellowDmEnabled: false }],
      mentorAssigned: false,
      staff: [STAFF]
    });

    expect(decision).toEqual({ allowed: false, reason: 'fellow_dm_disabled' });
  });

  it('keeps a stable channel id under 64 characters', () => {
    const forward = directChannelId('fellow_dm', ADULT_FELLOW.profileId, MINOR_FELLOW.profileId);
    const backward = directChannelId('fellow_dm', MINOR_FELLOW.profileId, ADULT_FELLOW.profileId);

    expect(forward).toBe(backward);
    expect(forward.length).toBeLessThanOrEqual(64);
    expect(forward.startsWith('fdm')).toBe(true);
  });
});

describe('client channel creation payload', () => {
  it('rejects a body that tries to name members or a channel id', () => {
    const parsed = ZOpenDirectMessage.safeParse({
      targetProfileId: ADULT_FELLOW.profileId,
      members: [MINOR_FELLOW.profileId],
      channelId: 'fdmcustom'
    });

    expect(parsed.success).toBe(false);
  });
});

describe('reviewMessageText', () => {
  it('blocks before it flags, and ignores a keyword hidden inside another word', () => {
    expect(reviewMessageText('see you in class', [{ phrase: 'ass', action: 'block' }])).toEqual({ action: 'allow' });

    expect(
      reviewMessageText('this is a bad word', [
        { phrase: 'word', action: 'flag' },
        { phrase: 'bad word', action: 'block' }
      ])
    ).toEqual({ action: 'block', phrase: 'bad word' });
  });
});

describe('transcript export', () => {
  it('escapes commas and quotes in csv', () => {
    const csv = transcriptToCsv([
      {
        id: 'm1',
        text: 'hello, "there"',
        userId: 'user-1',
        userName: 'Ada',
        createdAt: '2026-11-11T00:00:00.000Z'
      }
    ]);

    expect(csv).toContain('"hello, ""there"""');
    expect(csv.split('\n')).toHaveLength(2);
  });
});

describe('planUnreadMessageDigest', () => {
  it('stays deferred when messaging or smtp is off, and does not send when both are on', () => {
    expect(planUnreadMessageDigest({ messagingEnabled: false, smtpConfigured: false }).reason).toBe(
      'messaging_disabled'
    );
    expect(planUnreadMessageDigest({ messagingEnabled: true, smtpConfigured: false }).reason).toBe(
      'smtp_not_configured'
    );
    expect(planUnreadMessageDigest({ messagingEnabled: true, smtpConfigured: true }).reason).toBe(
      'delivery_not_implemented'
    );
  });
});
