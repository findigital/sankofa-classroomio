import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Context, Next } from 'hono';

import { Hono } from '@api/utils/hono';
import { AppError, ErrorCodes } from '@api/utils/errors';
import { ROLE } from '@cio/utils/constants';

const services = vi.hoisted(() => ({
  openDirectMessage: vi.fn(),
  syncCohortChannels: vi.fn(),
  listDirectCandidates: vi.fn(),
  listCohortSettings: vi.fn(),
  setCohortFellowDm: vi.fn(),
  issueMessagingSession: vi.fn(),
  acceptStaffDisclosure: vi.fn(),
  sendMessagingMessage: vi.fn(),
  readMessagingChannel: vi.fn(),
  exportMessagingChannel: vi.fn(),
  listOrganizationChannels: vi.fn(),
  addKeywordRule: vi.fn(),
  listKeywordRules: vi.fn(),
  removeKeywordRule: vi.fn(),
  flagMessagingMessage: vi.fn(),
  muteMessagingMember: vi.fn(),
  unmuteMessagingMember: vi.fn(),
  messagingActivity: vi.fn(),
  handleMessagingWebhook: vi.fn(),
  getStreamGateway: vi.fn(),
  getSafeguardingStaff: vi.fn(),
  setSafeguardingStaff: vi.fn()
}));

vi.mock('@api/services/messaging/direct', () => ({
  openDirectMessage: services.openDirectMessage
}));

vi.mock('@api/services/messaging/cohorts', () => ({
  syncCohortChannels: services.syncCohortChannels,
  listDirectCandidates: services.listDirectCandidates,
  listCohortSettings: services.listCohortSettings,
  setCohortFellowDm: services.setCohortFellowDm
}));

vi.mock('@api/services/messaging/session', () => ({
  issueMessagingSession: services.issueMessagingSession,
  acceptStaffDisclosure: services.acceptStaffDisclosure
}));

vi.mock('@api/services/messaging/messages', () => ({
  sendMessagingMessage: services.sendMessagingMessage,
  readMessagingChannel: services.readMessagingChannel,
  exportMessagingChannel: services.exportMessagingChannel,
  listOrganizationChannels: services.listOrganizationChannels
}));

vi.mock('@api/services/messaging/moderation', () => ({
  addKeywordRule: services.addKeywordRule,
  listKeywordRules: services.listKeywordRules,
  removeKeywordRule: services.removeKeywordRule,
  flagMessagingMessage: services.flagMessagingMessage,
  muteMessagingMember: services.muteMessagingMember,
  unmuteMessagingMember: services.unmuteMessagingMember,
  messagingActivity: services.messagingActivity,
  handleMessagingWebhook: services.handleMessagingWebhook
}));

vi.mock('@api/services/messaging/gateway', () => ({
  getStreamGateway: services.getStreamGateway
}));

vi.mock('@api/services/messaging/unread-digest', () => ({
  runUnreadMessageDigest: vi.fn()
}));

vi.mock('@api/services/messaging/safeguarding', () => ({
  getSafeguardingStaff: services.getSafeguardingStaff,
  setSafeguardingStaff: services.setSafeguardingStaff
}));

import { messagingRouter } from './index';

const ORG_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_ID = '22222222-2222-4222-8222-222222222222';

function buildApp(roleId: number) {
  const setContext = async (c: Context, next: Next) => {
    c.set('user', { id: USER_ID } as never);
    c.set('session', { id: 'session' } as never);
    c.set('orgRoles', { [ORG_ID]: roleId });
    await next();
  };

  return new Hono().use(setContext).route('/messaging', messagingRouter);
}

describe('messaging routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a client payload that tries to create a channel or name its members', async () => {
    const app = buildApp(ROLE.STUDENT);
    const response = await app.request('/messaging/direct', {
      method: 'POST',
      headers: { 'cio-org-id': ORG_ID, 'content-type': 'application/json' },
      body: JSON.stringify({
        targetProfileId: TARGET_ID,
        members: [USER_ID],
        channelId: 'fdmcustom'
      })
    });

    expect(response.status).toBe(400);
    expect(services.openDirectMessage).not.toHaveBeenCalled();
    expect(services.getStreamGateway).not.toHaveBeenCalled();
  });

  it('returns the mentor denial without opening a channel', async () => {
    services.openDirectMessage.mockRejectedValue(
      new AppError('Mentors can only message fellows assigned to them', ErrorCodes.MESSAGING_MENTOR_NOT_ASSIGNED, 403)
    );
    const app = buildApp(ROLE.TUTOR);
    const response = await app.request('/messaging/direct', {
      method: 'POST',
      headers: { 'cio-org-id': ORG_ID, 'content-type': 'application/json' },
      body: JSON.stringify({ targetProfileId: TARGET_ID })
    });
    const body = (await response.json()) as { code?: string };

    expect(response.status).toBe(403);
    expect(body.code).toBe(ErrorCodes.MESSAGING_MENTOR_NOT_ASSIGNED);
  });

  it('rejects a fellow managing keywords', async () => {
    const app = buildApp(ROLE.STUDENT);
    const response = await app.request('/messaging/keywords', { headers: { 'cio-org-id': ORG_ID } });

    expect(response.status).toBe(403);
    expect(services.listKeywordRules).not.toHaveBeenCalled();
  });
});
