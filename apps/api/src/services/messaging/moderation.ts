import {
  countMessagingFlags,
  createMessagingFlag,
  createMessagingKeyword,
  deleteMessagingKeyword,
  listMessagingKeywords,
  listMessagingProfiles,
  listRecentMessagingAudits,
  muteMessagingUser,
  unmuteMessagingUser,
  type MessagingAuditRow,
  type MessagingKeywordRow
} from '@cio/db/queries/messaging';
import { AppError, ErrorCodes } from '@api/utils/errors';
import { organizationBlocklistName, reviewMessageText, type KeywordRule } from '@cio/utils/functions/messaging';

import { assertMessagingAvailable } from './availability';
import { type StreamGateway } from './gateway';

const KEYWORD_CACHE_MS = 15_000;

const keywordCache = new Map<string, { at: number; keywords: KeywordRule[] }>();

export function clearMessagingKeywordCache(organizationId?: string): void {
  if (organizationId) {
    keywordCache.delete(organizationId);
    return;
  }

  keywordCache.clear();
}

export async function keywordsFor(organizationId: string): Promise<KeywordRule[]> {
  const cached = keywordCache.get(organizationId);

  if (cached && Date.now() - cached.at < KEYWORD_CACHE_MS) {
    return cached.keywords;
  }

  const rows = await listMessagingKeywords(organizationId);
  const keywords = rows.map((row) => ({ phrase: row.phrase, action: row.action }));
  keywordCache.set(organizationId, { at: Date.now(), keywords });

  return keywords;
}

async function syncBlockWords(organizationId: string, gateway: StreamGateway): Promise<void> {
  const keywords = await keywordsFor(organizationId);
  const words = keywords.filter((keyword) => keyword.action === 'block').map((keyword) => keyword.phrase);

  try {
    await gateway.syncCustomBlocklist(organizationBlocklistName(organizationId), words);
  } catch (error) {
    console.error('syncCustomBlocklist error:', error);
  }
}

export async function listKeywordRules(organizationId: string): Promise<MessagingKeywordRow[]> {
  assertMessagingAvailable();

  return listMessagingKeywords(organizationId);
}

export async function addKeywordRule(
  organizationId: string,
  actorProfileId: string,
  phrase: string,
  action: 'flag' | 'block',
  gateway: StreamGateway
): Promise<MessagingKeywordRow> {
  assertMessagingAvailable();

  const created = await createMessagingKeyword({
    organizationId,
    phrase,
    action,
    createdBy: actorProfileId
  });

  if (created === 'duplicate') {
    throw new AppError('That keyword already exists', ErrorCodes.MESSAGING_KEYWORD_EXISTS, 409);
  }

  clearMessagingKeywordCache(organizationId);
  await syncBlockWords(organizationId, gateway);

  return created;
}

export async function removeKeywordRule(
  organizationId: string,
  keywordId: string,
  actorProfileId: string,
  gateway: StreamGateway
): Promise<void> {
  assertMessagingAvailable();

  const removed = await deleteMessagingKeyword(organizationId, keywordId, actorProfileId);

  if (!removed) {
    throw new AppError('Keyword not found', ErrorCodes.MESSAGING_CHANNEL_NOT_FOUND, 404);
  }

  clearMessagingKeywordCache(organizationId);
  await syncBlockWords(organizationId, gateway);
}

export async function flagMessagingMessage(input: {
  organizationId: string;
  channelType: string;
  channelId: string;
  messageId: string;
  reporterProfileId: string;
  reason?: string;
}): Promise<{ id: string }> {
  assertMessagingAvailable();

  return createMessagingFlag({
    organizationId: input.organizationId,
    channelType: input.channelType,
    channelId: input.channelId,
    messageId: input.messageId,
    reporterProfileId: input.reporterProfileId,
    reason: input.reason ?? null
  });
}

export async function createKeywordFlag(input: {
  organizationId: string;
  channelType: string;
  channelId: string;
  messageId: string;
  phrase: string;
}): Promise<void> {
  await createMessagingFlag({
    organizationId: input.organizationId,
    channelType: input.channelType,
    channelId: input.channelId,
    messageId: input.messageId,
    reporterProfileId: null,
    reason: `keyword:${input.phrase}`
  });
}

export async function muteMessagingMember(
  organizationId: string,
  muterProfileId: string,
  mutedProfileId: string,
  gateway: StreamGateway
): Promise<void> {
  assertMessagingAvailable();

  if (muterProfileId === mutedProfileId) {
    throw new AppError('You cannot mute yourself', ErrorCodes.MESSAGING_FORBIDDEN, 403);
  }

  const profiles = await listMessagingProfiles(organizationId, [muterProfileId, mutedProfileId]);

  if (profiles.length < 2) {
    throw new AppError('That person is not in this organization', ErrorCodes.MESSAGING_FORBIDDEN, 403);
  }

  await muteMessagingUser(organizationId, muterProfileId, mutedProfileId);
  await gateway.muteUser(mutedProfileId, muterProfileId);
}

export async function unmuteMessagingMember(
  organizationId: string,
  muterProfileId: string,
  mutedProfileId: string,
  gateway: StreamGateway
): Promise<void> {
  assertMessagingAvailable();

  await unmuteMessagingUser(organizationId, muterProfileId, mutedProfileId);
  await gateway.unmuteUser(mutedProfileId, muterProfileId);
}

export async function messagingActivity(organizationId: string): Promise<{
  flags: Array<{ channelType: string; channelId: string; count: number }>;
  audits: MessagingAuditRow[];
}> {
  assertMessagingAvailable();

  const flags = await countMessagingFlags(organizationId);
  const audits = await listRecentMessagingAudits(organizationId);

  return { flags, audits };
}

type WebhookPayload = {
  message?: { id?: string; text?: string };
  channel?: { type?: string; id?: string; organization_id?: string };
};

/**
 * Backup check for the Stream before-message hook.
 * The API send path is authoritative because that hook fails open.
 */
export async function handleMessagingWebhook(
  rawBody: string,
  signature: string | undefined,
  gateway: StreamGateway
): Promise<{ message?: { type: 'error'; text: string } }> {
  assertMessagingAvailable();

  if (!signature || !gateway.verifyWebhook(rawBody, signature)) {
    throw new AppError('Invalid messaging webhook', ErrorCodes.MESSAGING_WEBHOOK_INVALID, 401);
  }

  let payload: WebhookPayload;

  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    throw new AppError('Invalid messaging webhook', ErrorCodes.MESSAGING_WEBHOOK_INVALID, 400);
  }

  const text = payload.message?.text ?? '';
  const organizationId = payload.channel?.organization_id;
  const channelType = payload.channel?.type;
  const channelId = payload.channel?.id;
  const messageId = payload.message?.id;

  if (!text || !organizationId || !channelType || !channelId || !messageId) {
    return {};
  }

  const verdict = reviewMessageText(text, await keywordsFor(organizationId));

  if (verdict.action === 'block') {
    return { message: { type: 'error', text: 'This message was blocked.' } };
  }

  if (verdict.action === 'flag') {
    await createKeywordFlag({
      organizationId,
      channelType,
      channelId,
      messageId,
      phrase: verdict.phrase
    });
  }

  return {};
}
