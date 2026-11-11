import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ROLE } from '@cio/utils/constants';
import { ErrorCodes } from '@cio/utils/errors';

import { markMessagingSetup } from './availability';
import type { StreamGateway } from './gateway';

const queries = vi.hoisted(() => ({
  recordMessagingAudit: vi.fn()
}));

const moderation = vi.hoisted(() => ({
  keywordsFor: vi.fn(),
  createKeywordFlag: vi.fn()
}));

vi.mock('@cio/db/queries/messaging', () => queries);
vi.mock('./moderation', () => moderation);

import { sendMessagingMessage } from './messages';

const ORG_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const FELLOW_ID = '11111111-1111-4111-8111-111111111111';

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

describe('sendMessagingMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MESSAGING_ENABLED = 'true';
    markMessagingSetup('ready');
  });

  it('does not send a message that matches a block keyword', async () => {
    const stream = gateway();
    vi.mocked(stream.inspectChannel).mockResolvedValue({
      organizationId: ORG_ID,
      purpose: 'discussion',
      memberIds: [FELLOW_ID],
      summary: {
        channelType: 'cohort_discussion',
        channelId: 'dis123',
        name: 'Cohort',
        purpose: 'discussion',
        cohortId: null,
        memberCount: 1,
        lastMessageAt: null
      }
    });
    moderation.keywordsFor.mockResolvedValue([{ phrase: 'bad word', action: 'block' }]);

    await expect(
      sendMessagingMessage(
        ORG_ID,
        FELLOW_ID,
        ROLE.STUDENT,
        { channelType: 'cohort_discussion', channelId: 'dis123', text: 'a bad word here' },
        stream
      )
    ).rejects.toMatchObject({ code: ErrorCodes.MESSAGING_MESSAGE_BLOCKED });
    expect(stream.sendMessage).not.toHaveBeenCalled();
    expect(moderation.createKeywordFlag).not.toHaveBeenCalled();
  });
});
