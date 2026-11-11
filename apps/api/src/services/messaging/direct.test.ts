import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ROLE } from '@cio/utils/constants';
import { ErrorCodes } from '@cio/utils/errors';

import { markMessagingSetup } from './availability';
import type { StreamGateway } from './gateway';

const queries = vi.hoisted(() => ({
  listMessagingProfiles: vi.fn(),
  listMessagingAdmins: vi.fn(),
  listSharedMessagingCohorts: vi.fn(),
  mentorPairAssigned: vi.fn(),
  readSafeguardingStaffIds: vi.fn()
}));

vi.mock('@cio/db/queries/messaging', () => queries);

import { openDirectMessage } from './direct';

const ORG_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const MENTOR_ID = '33333333-3333-4333-8333-333333333333';
const ADULT_ID = '11111111-1111-4111-8111-111111111111';
const MINOR_ID = '22222222-2222-4222-8222-222222222222';
const STAFF_ID = '44444444-4444-4444-8444-444444444444';

function profile(profileId: string, roleId: number, isMinor: boolean) {
  return { profileId, roleId, isMinor, name: 'Member', avatarUrl: null };
}

function gateway(): StreamGateway {
  return {
    upsertUsers: vi.fn(),
    createToken: vi.fn(),
    ensureChannelTypes: vi.fn(),
    syncCustomBlocklist: vi.fn(),
    setBeforeMessageWebhook: vi.fn(),
    ensureChannel: vi.fn(),
    queryMemberChannels: vi.fn(),
    queryOrganizationChannels: vi.fn(),
    inspectChannel: vi.fn(),
    readMessages: vi.fn(),
    sendMessage: vi.fn(),
    muteUser: vi.fn(),
    unmuteUser: vi.fn(),
    verifyWebhook: vi.fn()
  };
}

describe('openDirectMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MESSAGING_ENABLED = 'true';
    markMessagingSetup('ready');
    queries.listMessagingAdmins.mockResolvedValue([profile(STAFF_ID, ROLE.ADMIN, false)]);
    queries.readSafeguardingStaffIds.mockResolvedValue(null);
    queries.listSharedMessagingCohorts.mockResolvedValue([]);
    queries.mentorPairAssigned.mockResolvedValue(false);
  });

  it('denies an unassigned mentor and does not create a channel', async () => {
    queries.listMessagingProfiles.mockResolvedValue([
      profile(MENTOR_ID, ROLE.TUTOR, false),
      profile(ADULT_ID, ROLE.STUDENT, false)
    ]);
    const stream = gateway();

    await expect(openDirectMessage(ORG_ID, MENTOR_ID, ADULT_ID, stream)).rejects.toMatchObject({
      code: ErrorCodes.MESSAGING_MENTOR_NOT_ASSIGNED
    });
    expect(stream.ensureChannel).not.toHaveBeenCalled();
    expect(stream.upsertUsers).not.toHaveBeenCalled();
  });

  it('denies a minor-to-adult direct message when no staff member can be added', async () => {
    queries.listMessagingProfiles.mockResolvedValue([
      profile(MENTOR_ID, ROLE.TUTOR, false),
      profile(MINOR_ID, ROLE.STUDENT, true)
    ]);
    queries.listMessagingAdmins.mockResolvedValue([]);
    queries.mentorPairAssigned.mockResolvedValue(true);
    const stream = gateway();

    await expect(openDirectMessage(ORG_ID, MENTOR_ID, MINOR_ID, stream)).rejects.toMatchObject({
      code: ErrorCodes.MESSAGING_MINOR_ADULT_REQUIRES_STAFF
    });
    expect(stream.ensureChannel).not.toHaveBeenCalled();
  });

  it('adds a staff member when an assigned mentor messages a minor', async () => {
    queries.listMessagingProfiles.mockResolvedValue([
      profile(MENTOR_ID, ROLE.TUTOR, false),
      profile(MINOR_ID, ROLE.STUDENT, true)
    ]);
    queries.mentorPairAssigned.mockResolvedValue(true);
    const stream = gateway();
    vi.mocked(stream.ensureChannel).mockResolvedValue({
      channelType: 'mentor_dm',
      channelId: 'mdm',
      name: 'mentor_dm',
      purpose: 'mentor_dm',
      cohortId: null,
      memberCount: 3,
      lastMessageAt: null
    });

    await openDirectMessage(ORG_ID, MENTOR_ID, MINOR_ID, stream);

    expect(stream.ensureChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        channelType: 'mentor_dm',
        memberIds: expect.arrayContaining([MENTOR_ID, MINOR_ID, STAFF_ID])
      })
    );
  });

  it('adds only the configured safeguarding staff, not every admin', async () => {
    const otherStaffId = '55555555-5555-4555-8555-555555555555';
    queries.listMessagingProfiles.mockResolvedValue([
      profile(MENTOR_ID, ROLE.TUTOR, false),
      profile(MINOR_ID, ROLE.STUDENT, true)
    ]);
    queries.listMessagingAdmins.mockResolvedValue([
      profile(STAFF_ID, ROLE.ADMIN, false),
      profile(otherStaffId, ROLE.ADMIN, false)
    ]);
    queries.readSafeguardingStaffIds.mockResolvedValue([STAFF_ID]);
    queries.mentorPairAssigned.mockResolvedValue(true);
    const stream = gateway();
    vi.mocked(stream.ensureChannel).mockResolvedValue({
      channelType: 'mentor_dm',
      channelId: 'mdm',
      name: 'mentor_dm',
      purpose: 'mentor_dm',
      cohortId: null,
      memberCount: 3,
      lastMessageAt: null
    });

    await openDirectMessage(ORG_ID, MENTOR_ID, MINOR_ID, stream);

    const memberIds = vi.mocked(stream.ensureChannel).mock.calls[0]?.[0].memberIds ?? [];

    expect(memberIds).toEqual(expect.arrayContaining([MENTOR_ID, MINOR_ID, STAFF_ID]));
    expect(memberIds).not.toContain(otherStaffId);
  });

  it('denies a minor direct message when the safeguarding list is set and empty', async () => {
    queries.listMessagingProfiles.mockResolvedValue([
      profile(MENTOR_ID, ROLE.TUTOR, false),
      profile(MINOR_ID, ROLE.STUDENT, true)
    ]);
    queries.readSafeguardingStaffIds.mockResolvedValue([]);
    queries.mentorPairAssigned.mockResolvedValue(true);
    const stream = gateway();

    await expect(openDirectMessage(ORG_ID, MENTOR_ID, MINOR_ID, stream)).rejects.toMatchObject({
      code: ErrorCodes.MESSAGING_MINOR_ADULT_REQUIRES_STAFF
    });
    expect(stream.ensureChannel).not.toHaveBeenCalled();
  });
});
