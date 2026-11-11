import * as z from 'zod';

import { MESSAGING_CHANNEL_TYPES } from '../../functions/messaging';

const channelId = z
  .string()
  .trim()
  .regex(/^[a-z0-9]{8,64}$/);

export const ZOpenDirectMessage = z.strictObject({
  targetProfileId: z.string().uuid()
});

export type TOpenDirectMessage = z.infer<typeof ZOpenDirectMessage>;

export const ZSendMessagingMessage = z.strictObject({
  channelType: z.enum(MESSAGING_CHANNEL_TYPES),
  channelId,
  text: z.string().trim().min(1).max(5000)
});

export type TSendMessagingMessage = z.infer<typeof ZSendMessagingMessage>;

export const ZFlagMessagingMessage = z.strictObject({
  channelType: z.enum(MESSAGING_CHANNEL_TYPES),
  channelId,
  messageId: z.string().trim().min(1).max(128),
  reason: z.string().trim().max(500).optional()
});

export type TFlagMessagingMessage = z.infer<typeof ZFlagMessagingMessage>;

export const ZMuteMessagingUser = z.strictObject({
  profileId: z.string().uuid()
});

export type TMuteMessagingUser = z.infer<typeof ZMuteMessagingUser>;

export const ZMessagingProfileParam = z.object({
  profileId: z.string().uuid()
});

export const ZMessagingChannelParam = z.object({
  channelType: z.enum(MESSAGING_CHANNEL_TYPES),
  channelId
});

export const ZMessagingExportQuery = z.object({
  format: z.enum(['json', 'csv']).default('json')
});

export type TMessagingExportQuery = z.infer<typeof ZMessagingExportQuery>;

export const ZMessagingKeyword = z.strictObject({
  phrase: z.string().trim().min(2).max(80),
  action: z.enum(['flag', 'block'])
});

export type TMessagingKeyword = z.infer<typeof ZMessagingKeyword>;

export const ZMessagingKeywordParam = z.object({
  keywordId: z.string().uuid()
});

export const ZCohortMessagingParam = z.object({
  groupId: z.string().uuid()
});

export const ZCohortMessagingSetting = z.strictObject({
  fellowDmEnabled: z.boolean()
});

export type TCohortMessagingSetting = z.infer<typeof ZCohortMessagingSetting>;
