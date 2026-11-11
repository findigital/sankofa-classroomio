import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ROLE } from '@cio/utils/constants';
import { cohortChannelId } from '@cio/utils/functions/messaging';

import { markMessagingSetup } from './availability';
import type { StreamGateway } from './gateway';

const queries = vi.hoisted(() => ({
  listCohortRosters: vi.fn(),
  listMessagingAdmins: vi.fn(),
  listAssignedFellows: vi.fn(),
  listCohortMessagingSettings: vi.fn(),
  upsertCohortMessagingSetting: vi.fn()
}));

vi.mock('@cio/db/queries/messaging', () => queries);

import { syncCohortChannels } from './cohorts';

const ORG_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const FELLOW_ID = '11111111-1111-4111-8111-111111111111';
const PUBLISHED_GROUP = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DRAFT_GROUP = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function gateway(): StreamGateway {
  return {
    upsertUsers: vi.fn(),
    createToken: vi.fn(),
    ensureChannelTypes: vi.fn(),
    syncCustomBlocklist: vi.fn(),
    setBeforeMessageWebhook: vi.fn(),
    ensureChannel: vi.fn().mockResolvedValue({
      channelType: 'cohort_discussion',
      channelId: 'dis',
      name: 'Cohort',
      purpose: 'discussion',
      cohortId: PUBLISHED_GROUP,
      memberCount: 1,
      lastMessageAt: null
    }),
    queryMemberChannels: vi.fn(),
    queryOrganizationChannels: vi.fn(),
    inspectChannel: vi.fn(),
    readMessages: vi.fn(),
    sendMessage: vi.fn(),
    removeChannelMember: vi.fn(),
    muteUser: vi.fn(),
    unmuteUser: vi.fn(),
    verifyWebhook: vi.fn()
  };
}

describe('syncCohortChannels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MESSAGING_ENABLED = 'true';
    markMessagingSetup('ready');
    queries.listMessagingAdmins.mockResolvedValue([]);
    queries.listCohortRosters.mockResolvedValue([
      {
        groupId: PUBLISHED_GROUP,
        name: 'Published cohort',
        courseName: 'React Basics',
        courseImage: 'https://cdn.example/react.png',
        fellowDmEnabled: false,
        members: [
          {
            profileId: FELLOW_ID,
            roleId: ROLE.STUDENT,
            isMinor: false,
            name: 'Fellow',
            avatarUrl: null
          }
        ]
      }
    ]);
  });

  it('creates channels only for published cohorts and hides draft channels from the inbox', async () => {
    const stream = gateway();
    vi.mocked(stream.queryMemberChannels).mockResolvedValue([
      {
        channelType: 'cohort_discussion',
        channelId: cohortChannelId('discussion', PUBLISHED_GROUP),
        name: 'Published cohort',
        purpose: 'discussion',
        cohortId: PUBLISHED_GROUP,
        memberCount: 1,
        lastMessageAt: null
      },
      {
        channelType: 'cohort_discussion',
        channelId: cohortChannelId('discussion', DRAFT_GROUP),
        name: 'Draft cohort',
        purpose: 'discussion',
        cohortId: DRAFT_GROUP,
        memberCount: 1,
        lastMessageAt: null
      },
      {
        channelType: 'fellow_dm',
        channelId: 'fdm12345678',
        name: 'fellow_dm',
        purpose: 'fellow_dm',
        cohortId: null,
        memberCount: 2,
        lastMessageAt: null
      }
    ]);

    const listed = await syncCohortChannels(ORG_ID, FELLOW_ID, ROLE.STUDENT, stream);
    const createdIds = vi.mocked(stream.ensureChannel).mock.calls.map((call) => call[0].channelId);

    expect(createdIds).toEqual([
      cohortChannelId('announcement', PUBLISHED_GROUP),
      cohortChannelId('discussion', PUBLISHED_GROUP)
    ]);
    expect(vi.mocked(stream.ensureChannel).mock.calls.map((call) => call[0].name)).toEqual([
      'React Basics Announcements',
      'React Basics Discussion'
    ]);
    expect(createdIds).not.toContain(cohortChannelId('discussion', DRAFT_GROUP));
    expect(listed.map((channel) => channel.cohortId)).toEqual([PUBLISHED_GROUP, null]);
    expect(listed.map((channel) => channel.image)).toEqual(['https://cdn.example/react.png', null]);
    expect(vi.mocked(stream.removeChannelMember).mock.calls).toEqual([
      ['cohort_discussion', cohortChannelId('discussion', DRAFT_GROUP), FELLOW_ID]
    ]);
  });
});
