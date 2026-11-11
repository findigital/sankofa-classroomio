import { zValidator } from '@hono/zod-validator';

import { authMiddleware } from '@api/middlewares/auth';
import { orgAdminMiddleware } from '@api/middlewares/org-admin';
import {
  listDirectCandidates,
  listCohortSettings,
  setCohortFellowDm,
  syncCohortChannels
} from '@api/services/messaging/cohorts';
import { openDirectMessage } from '@api/services/messaging/direct';
import { getStreamGateway } from '@api/services/messaging/gateway';
import {
  exportMessagingChannel,
  listOrganizationChannels,
  readMessagingChannel,
  sendMessagingMessage
} from '@api/services/messaging/messages';
import {
  addKeywordRule,
  flagMessagingMessage,
  handleMessagingWebhook,
  listKeywordRules,
  messagingActivity,
  muteMessagingMember,
  removeKeywordRule,
  unmuteMessagingMember
} from '@api/services/messaging/moderation';
import { acceptStaffDisclosure, issueMessagingSession } from '@api/services/messaging/session';
import { runUnreadMessageDigest } from '@api/services/messaging/unread-digest';
import { AppError, ErrorCodes, handleError } from '@api/utils/errors';
import { Hono } from '@api/utils/hono';
import { ROLE } from '@cio/utils/constants';
import {
  ZCohortMessagingParam,
  ZCohortMessagingSetting,
  ZFlagMessagingMessage,
  ZMessagingChannelParam,
  ZMessagingExportQuery,
  ZMessagingKeyword,
  ZMessagingKeywordParam,
  ZMessagingProfileParam,
  ZMuteMessagingUser,
  ZOpenDirectMessage,
  ZSendMessagingMessage
} from '@cio/utils/validation/messaging';

function viewer(c: {
  get: (key: 'user' | 'orgRoles') => unknown;
  req: { header: (name: string) => string | undefined };
}) {
  const user = c.get('user') as { id: string } | undefined;
  const orgId = c.req.header('cio-org-id');
  const orgRoles = (c.get('orgRoles') as Record<string, number> | undefined) ?? {};

  if (!user) {
    throw new AppError('Unauthorized', ErrorCodes.MESSAGING_FORBIDDEN, 401);
  }

  if (!orgId) {
    throw new AppError('Organization ID is required', ErrorCodes.MESSAGING_FORBIDDEN, 400);
  }

  const roleId = orgRoles[orgId];

  if (!roleId) {
    throw new AppError('You are not in this organization', ErrorCodes.MESSAGING_FORBIDDEN, 403);
  }

  return { profileId: user.id, organizationId: orgId, roleId };
}

export const messagingRouter = new Hono()
  .post('/webhook', async (c) => {
    try {
      const rawBody = await c.req.text();
      const data = await handleMessagingWebhook(rawBody, c.req.header('x-signature'), getStreamGateway());

      return c.json(data, 200);
    } catch (error) {
      return handleError(c, error, 'Failed to handle messaging webhook');
    }
  })
  .get('/session', authMiddleware, async (c) => {
    try {
      const member = viewer(c);
      const data = await issueMessagingSession(member.organizationId, member.profileId, getStreamGateway());

      return c.json({ success: true, data }, 200);
    } catch (error) {
      return handleError(c, error, 'Failed to open messaging');
    }
  })
  .post('/disclosure', authMiddleware, async (c) => {
    try {
      const member = viewer(c);
      const data = await acceptStaffDisclosure(member.organizationId, member.profileId);

      return c.json({ success: true, data }, 200);
    } catch (error) {
      return handleError(c, error, 'Failed to record messaging notice');
    }
  })
  .get('/channels', authMiddleware, async (c) => {
    try {
      const member = viewer(c);
      const data = await syncCohortChannels(member.organizationId, member.profileId, member.roleId, getStreamGateway());

      return c.json({ success: true, data }, 200);
    } catch (error) {
      return handleError(c, error, 'Failed to load conversations');
    }
  })
  .get('/channels/:channelType/:channelId', authMiddleware, zValidator('param', ZMessagingChannelParam), async (c) => {
    try {
      const member = viewer(c);
      const { channelType, channelId } = c.req.valid('param');
      const data = await readMessagingChannel(
        member.organizationId,
        member.profileId,
        member.roleId,
        channelType,
        channelId,
        getStreamGateway()
      );

      return c.json({ success: true, data }, 200);
    } catch (error) {
      return handleError(c, error, 'Failed to load messages');
    }
  })
  .get('/directory', authMiddleware, async (c) => {
    try {
      const member = viewer(c);
      const data = await listDirectCandidates(member.organizationId, member.profileId, member.roleId);

      return c.json({ success: true, data }, 200);
    } catch (error) {
      return handleError(c, error, 'Failed to load people');
    }
  })
  .post('/direct', authMiddleware, zValidator('json', ZOpenDirectMessage), async (c) => {
    try {
      const member = viewer(c);
      const { targetProfileId } = c.req.valid('json');
      const data = await openDirectMessage(
        member.organizationId,
        member.profileId,
        targetProfileId,
        getStreamGateway()
      );

      return c.json({ success: true, data }, 200);
    } catch (error) {
      return handleError(c, error, 'Failed to open conversation');
    }
  })
  .post('/messages', authMiddleware, zValidator('json', ZSendMessagingMessage), async (c) => {
    try {
      const member = viewer(c);
      const body = c.req.valid('json');
      const data = await sendMessagingMessage(
        member.organizationId,
        member.profileId,
        member.roleId,
        body,
        getStreamGateway()
      );

      return c.json({ success: true, data }, 200);
    } catch (error) {
      return handleError(c, error, 'Failed to send message');
    }
  })
  .post('/flags', authMiddleware, zValidator('json', ZFlagMessagingMessage), async (c) => {
    try {
      const member = viewer(c);
      const body = c.req.valid('json');
      const data = await flagMessagingMessage({
        organizationId: member.organizationId,
        channelType: body.channelType,
        channelId: body.channelId,
        messageId: body.messageId,
        reporterProfileId: member.profileId,
        reason: body.reason
      });

      return c.json({ success: true, data }, 200);
    } catch (error) {
      return handleError(c, error, 'Failed to flag message');
    }
  })
  .post('/mutes', authMiddleware, zValidator('json', ZMuteMessagingUser), async (c) => {
    try {
      const member = viewer(c);
      const { profileId } = c.req.valid('json');
      await muteMessagingMember(member.organizationId, member.profileId, profileId, getStreamGateway());

      return c.json({ success: true, data: { muted: true } }, 200);
    } catch (error) {
      return handleError(c, error, 'Failed to mute user');
    }
  })
  .delete('/mutes/:profileId', authMiddleware, zValidator('param', ZMessagingProfileParam), async (c) => {
    try {
      const member = viewer(c);
      const { profileId } = c.req.valid('param');
      await unmuteMessagingMember(member.organizationId, member.profileId, profileId, getStreamGateway());

      return c.json({ success: true, data: { muted: false } }, 200);
    } catch (error) {
      return handleError(c, error, 'Failed to unmute user');
    }
  })
  .get('/admin/channels', authMiddleware, orgAdminMiddleware, async (c) => {
    try {
      const member = viewer(c);
      const data = await listOrganizationChannels(member.organizationId, getStreamGateway());

      return c.json({ success: true, data }, 200);
    } catch (error) {
      return handleError(c, error, 'Failed to load organization conversations');
    }
  })
  .get(
    '/admin/channels/:channelType/:channelId',
    authMiddleware,
    orgAdminMiddleware,
    zValidator('param', ZMessagingChannelParam),
    async (c) => {
      try {
        const member = viewer(c);
        const { channelType, channelId } = c.req.valid('param');
        const data = await readMessagingChannel(
          member.organizationId,
          member.profileId,
          ROLE.ADMIN,
          channelType,
          channelId,
          getStreamGateway()
        );

        return c.json({ success: true, data }, 200);
      } catch (error) {
        return handleError(c, error, 'Failed to load conversation');
      }
    }
  )
  .get(
    '/admin/channels/:channelType/:channelId/export',
    authMiddleware,
    orgAdminMiddleware,
    zValidator('param', ZMessagingChannelParam),
    zValidator('query', ZMessagingExportQuery),
    async (c) => {
      try {
        const member = viewer(c);
        const { channelType, channelId } = c.req.valid('param');
        const { format } = c.req.valid('query');
        const data = await exportMessagingChannel(
          member.organizationId,
          member.profileId,
          channelType,
          channelId,
          format,
          getStreamGateway()
        );

        return c.json({ success: true, data }, 200);
      } catch (error) {
        return handleError(c, error, 'Failed to export conversation');
      }
    }
  )
  .get('/admin/activity', authMiddleware, orgAdminMiddleware, async (c) => {
    try {
      const member = viewer(c);
      const data = await messagingActivity(member.organizationId);

      return c.json({ success: true, data }, 200);
    } catch (error) {
      return handleError(c, error, 'Failed to load messaging activity');
    }
  })
  .get('/keywords', authMiddleware, orgAdminMiddleware, async (c) => {
    try {
      const member = viewer(c);
      const data = await listKeywordRules(member.organizationId);

      return c.json({ success: true, data }, 200);
    } catch (error) {
      return handleError(c, error, 'Failed to load keywords');
    }
  })
  .post('/keywords', authMiddleware, orgAdminMiddleware, zValidator('json', ZMessagingKeyword), async (c) => {
    try {
      const member = viewer(c);
      const body = c.req.valid('json');
      const data = await addKeywordRule(
        member.organizationId,
        member.profileId,
        body.phrase,
        body.action,
        getStreamGateway()
      );

      return c.json({ success: true, data }, 200);
    } catch (error) {
      return handleError(c, error, 'Failed to save keyword');
    }
  })
  .delete(
    '/keywords/:keywordId',
    authMiddleware,
    orgAdminMiddleware,
    zValidator('param', ZMessagingKeywordParam),
    async (c) => {
      try {
        const member = viewer(c);
        const { keywordId } = c.req.valid('param');
        await removeKeywordRule(member.organizationId, keywordId, member.profileId, getStreamGateway());

        return c.json({ success: true, data: { deleted: true } }, 200);
      } catch (error) {
        return handleError(c, error, 'Failed to delete keyword');
      }
    }
  )
  .get('/cohorts', authMiddleware, orgAdminMiddleware, async (c) => {
    try {
      const member = viewer(c);
      const data = await listCohortSettings(member.organizationId);

      return c.json({ success: true, data }, 200);
    } catch (error) {
      return handleError(c, error, 'Failed to load cohort messaging');
    }
  })
  .put(
    '/cohorts/:groupId',
    authMiddleware,
    orgAdminMiddleware,
    zValidator('param', ZCohortMessagingParam),
    zValidator('json', ZCohortMessagingSetting),
    async (c) => {
      try {
        const member = viewer(c);
        const { groupId } = c.req.valid('param');
        const { fellowDmEnabled } = c.req.valid('json');
        const data = await setCohortFellowDm(member.organizationId, groupId, fellowDmEnabled, member.profileId);

        return c.json({ success: true, data }, 200);
      } catch (error) {
        return handleError(c, error, 'Failed to save cohort messaging');
      }
    }
  )
  .post('/digest', authMiddleware, orgAdminMiddleware, async (c) => {
    try {
      viewer(c);
      const data = runUnreadMessageDigest();

      return c.json({ success: true, data }, 200);
    } catch (error) {
      return handleError(c, error, 'Failed to plan messaging digest');
    }
  });
