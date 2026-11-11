import { recordMessagingAudit, listPublishedMessagingGroupIds } from '@cio/db/queries/messaging';
import { ROLE } from '@cio/utils/constants';
import { AppError, ErrorCodes } from '@api/utils/errors';
import {
  canSendToPurpose,
  isListedCohortChannel,
  reviewMessageText,
  transcriptToCsv,
  transcriptToJson,
  type TranscriptMessage
} from '@cio/utils/functions/messaging';

import { assertMessagingAvailable } from './availability';
import { reconcileExistingDirectMessage } from './direct';
import { type MessagingChannelSummary, type StreamGateway } from './gateway';
import { createKeywordFlag, keywordsFor } from './moderation';

export type MessagingExportFile = {
  format: 'json' | 'csv';
  filename: string;
  contentType: string;
  body: string;
};

async function loadOrgChannel(gateway: StreamGateway, organizationId: string, channelType: string, channelId: string) {
  const channel = await gateway.inspectChannel(channelType, channelId);

  if (!channel || channel.organizationId !== organizationId) {
    throw new AppError('Conversation not found', ErrorCodes.MESSAGING_CHANNEL_NOT_FOUND, 404);
  }

  return channel;
}

/**
 * Sends a message as the signed-in member.
 * Keyword blocks are rejected before Stream receives the message.
 */
export async function sendMessagingMessage(
  organizationId: string,
  profileId: string,
  roleId: number,
  input: { channelType: string; channelId: string; text: string },
  gateway: StreamGateway
): Promise<{ id: string }> {
  assertMessagingAvailable();

  const channel = await loadOrgChannel(gateway, organizationId, input.channelType, input.channelId);
  const isMember = channel.memberIds.includes(profileId);
  const staffOverride = roleId === ROLE.ADMIN && !isMember;

  if (!isMember && roleId !== ROLE.ADMIN) {
    throw new AppError('You are not in this conversation', ErrorCodes.MESSAGING_FORBIDDEN, 403);
  }

  if (!canSendToPurpose(roleId, channel.purpose)) {
    throw new AppError('You cannot post in this conversation', ErrorCodes.MESSAGING_FORBIDDEN, 403);
  }

  if (staffOverride && channel.purpose !== 'announcement' && channel.purpose !== 'discussion') {
    throw new AppError('You cannot post in this conversation', ErrorCodes.MESSAGING_FORBIDDEN, 403);
  }

  const verdict = reviewMessageText(input.text, await keywordsFor(organizationId));

  if (verdict.action === 'block') {
    throw new AppError('This message was blocked', ErrorCodes.MESSAGING_MESSAGE_BLOCKED, 400);
  }

  const sent = await gateway.sendMessage({
    channelType: input.channelType,
    channelId: input.channelId,
    userId: profileId,
    text: input.text
  });

  if (verdict.action === 'flag') {
    await createKeywordFlag({
      organizationId,
      channelType: input.channelType,
      channelId: input.channelId,
      messageId: sent.id,
      phrase: verdict.phrase
    });
  }

  return sent;
}

export async function readMessagingChannel(
  organizationId: string,
  profileId: string,
  roleId: number,
  channelType: string,
  channelId: string,
  gateway: StreamGateway
): Promise<{ messages: TranscriptMessage[] }> {
  assertMessagingAvailable();

  const channel = await loadOrgChannel(gateway, organizationId, channelType, channelId);
  const isMember = channel.memberIds.includes(profileId);

  if (!isMember && roleId !== ROLE.ADMIN) {
    throw new AppError('You are not in this conversation', ErrorCodes.MESSAGING_FORBIDDEN, 403);
  }

  if (channel.purpose === 'fellow_dm' || channel.purpose === 'mentor_dm') {
    await reconcileExistingDirectMessage(organizationId, channel.purpose, channel.memberIds, gateway);
  }

  const messages = await gateway.readMessages(channelType, channelId);

  if (roleId === ROLE.ADMIN) {
    const messageCount = messages.length;
    await recordMessagingAudit({
      organizationId,
      actorProfileId: profileId,
      action: 'read',
      channelType,
      channelId,
      metadata: { messageCount }
    });
  }

  return { messages };
}

export async function exportMessagingChannel(
  organizationId: string,
  profileId: string,
  channelType: string,
  channelId: string,
  format: 'json' | 'csv',
  gateway: StreamGateway
): Promise<MessagingExportFile> {
  assertMessagingAvailable();

  await loadOrgChannel(gateway, organizationId, channelType, channelId);
  const messages = await gateway.readMessages(channelType, channelId);
  const messageCount = messages.length;
  const body = format === 'csv' ? transcriptToCsv(messages) : transcriptToJson(messages);
  const contentType = format === 'csv' ? 'text/csv' : 'application/json';
  const filename = `${channelType}-${channelId}.${format}`;

  await recordMessagingAudit({
    organizationId,
    actorProfileId: profileId,
    action: 'export',
    channelType,
    channelId,
    metadata: { format, messageCount }
  });

  return { format, filename, contentType, body };
}

export async function listOrganizationChannels(
  organizationId: string,
  gateway: StreamGateway
): Promise<MessagingChannelSummary[]> {
  assertMessagingAvailable();

  const publishedGroupIds = new Set(await listPublishedMessagingGroupIds(organizationId));
  const channels = await gateway.queryOrganizationChannels(organizationId);

  return channels.filter((channel) => isListedCohortChannel(channel, publishedGroupIds));
}
