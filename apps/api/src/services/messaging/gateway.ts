import { StreamChat, type Channel, type Message } from 'stream-chat';

declare module 'stream-chat' {
  interface CustomChannelData {
    name?: string;
    organization_id?: string;
    purpose?: string;
    cohort_id?: string;
    staff_visible?: boolean;
  }
}

import { channelTypeDefinitions, channelTypeUpdate, type TranscriptMessage } from '@cio/utils/functions/messaging';

export type StreamPerson = {
  id: string;
  name: string;
  image?: string;
};

export type MessagingChannelSummary = {
  channelType: string;
  channelId: string;
  name: string;
  purpose: string;
  cohortId: string | null;
  memberCount: number;
  lastMessageAt: string | null;
  image?: string | null;
};

export type EnsureMessagingChannel = {
  channelType: string;
  channelId: string;
  organizationId: string;
  name: string;
  purpose: string;
  cohortId?: string;
  createdById: string;
  memberIds: string[];
  protectedMemberIds?: string[];
};

export type InspectedChannel = {
  organizationId: string;
  purpose: string;
  memberIds: string[];
  summary: MessagingChannelSummary;
};

export interface StreamGateway {
  upsertUsers(users: StreamPerson[]): Promise<void>;
  createToken(userId: string, expiresAtUnix: number): string;
  ensureChannelTypes(): Promise<void>;
  syncCustomBlocklist(name: string, words: string[]): Promise<void>;
  setBeforeMessageWebhook(url: string): Promise<void>;
  ensureChannel(input: EnsureMessagingChannel): Promise<MessagingChannelSummary>;
  queryMemberChannels(userId: string, organizationId: string): Promise<MessagingChannelSummary[]>;
  queryOrganizationChannels(organizationId: string): Promise<MessagingChannelSummary[]>;
  inspectChannel(channelType: string, channelId: string): Promise<InspectedChannel | null>;
  readMessages(channelType: string, channelId: string): Promise<TranscriptMessage[]>;
  sendMessage(input: {
    channelType: string;
    channelId: string;
    userId: string;
    text: string;
    id?: string;
    parentId?: string;
  }): Promise<{ id: string }>;
  removeChannelMember(channelType: string, channelId: string, userId: string): Promise<void>;
  muteUser(mutedUserId: string, muterUserId: string): Promise<void>;
  unmuteUser(mutedUserId: string, muterUserId: string): Promise<void>;
  verifyWebhook(rawBody: string, signature: string): boolean;
}

const MESSAGE_PAGE = 100;
const MESSAGE_PAGE_CAP = 20;
const CHANNEL_QUERY_LIMIT = 100;
const MEMBER_BATCH = 100;
const MEMBER_PAGE_CAP = 100;
const EMPTY_BLOCKLIST_WORD = '__sankofa_no_keywords__';

function isMissing(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const record = error as { code?: number; status?: number };

  return record.code === 16 || record.status === 404;
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

type ChannelFields = {
  name?: string;
  purpose?: string;
  cohort_id?: string;
  organization_id?: string;
  member_count?: number;
};

function channelFields(channel: Channel): ChannelFields {
  return (channel.data ?? {}) as ChannelFields;
}

function summarize(channel: Channel): MessagingChannelSummary | null {
  if (!channel.id) return null;

  const data = channelFields(channel);
  const lastMessageAt = channel.state?.last_message_at;

  return {
    channelType: channel.type,
    channelId: channel.id,
    name: asText(data.name),
    purpose: asText(data.purpose),
    cohortId: asText(data.cohort_id) || null,
    memberCount: typeof data.member_count === 'number' ? data.member_count : 0,
    lastMessageAt: lastMessageAt ? new Date(lastMessageAt).toISOString() : null
  };
}

function toTranscript(message: {
  id?: string;
  text?: string;
  user?: { id?: string; name?: string } | null;
  created_at?: string | Date;
}): TranscriptMessage {
  const createdAt = message.created_at ? new Date(message.created_at).toISOString() : '';

  return {
    id: message.id ?? '',
    text: message.text ?? '',
    userId: message.user?.id ?? '',
    userName: message.user?.name ?? '',
    createdAt
  };
}

export class StreamServerGateway implements StreamGateway {
  constructor(private readonly client: StreamChat) {}

  async upsertUsers(users: StreamPerson[]): Promise<void> {
    const unique = new Map(users.filter((user) => user.id).map((user) => [user.id, user]));
    const people = [...unique.values()];

    for (let index = 0; index < people.length; index += 100) {
      await this.client.upsertUsers(people.slice(index, index + 100));
    }
  }

  createToken(userId: string, expiresAtUnix: number): string {
    return this.client.createToken(userId, expiresAtUnix);
  }

  async ensureChannelTypes(): Promise<void> {
    for (const definition of channelTypeDefinitions()) {
      try {
        await this.client.getChannelType(definition.name);
      } catch (error) {
        if (!isMissing(error)) throw error;

        await this.client.createChannelType({
          name: definition.name,
          grants: definition.grants,
          reactions: true,
          replies: true,
          uploads: false,
          mutes: true
        });
      }

      await this.client.updateChannelType(definition.name, channelTypeUpdate(definition));
    }
  }

  async syncCustomBlocklist(name: string, words: string[]): Promise<void> {
    // Stream blocklists are app-wide. Per-org words stay unattached so one org cannot block another.
    const payload = { words: words.length > 0 ? words : [EMPTY_BLOCKLIST_WORD] };

    try {
      await this.client.getBlockList(name);
      await this.client.updateBlockList(name, payload);
    } catch (error) {
      if (!isMissing(error)) throw error;

      await this.client.createBlockList({ name, words: payload.words });
    }
  }

  async setBeforeMessageWebhook(url: string): Promise<void> {
    await this.client.updateAppSettings({ before_message_send_hook_url: url });
  }

  /**
   * Creates the channel when it is missing and sets membership to memberIds.
   * Ids in protectedMemberIds stay even when they are absent from memberIds.
   * memberCount is Stream's member_count after that update.
   */
  async ensureChannel(input: EnsureMessagingChannel): Promise<MessagingChannelSummary> {
    const channel = this.client.channel(input.channelType, input.channelId, {
      created_by_id: input.createdById,
      name: input.name,
      organization_id: input.organizationId,
      purpose: input.purpose,
      cohort_id: input.cohortId,
      staff_visible: true,
      members: input.memberIds.slice(0, MEMBER_BATCH)
    } as Channel['data']);

    try {
      await channel.create();
    } catch (error) {
      if (!isMissing(error) && !isAlreadyExists(error)) {
        await channel.query({ state: true, watch: false, messages: { limit: 0 } });
      }
    }

    await reconcileChannelMembers(channel, input);

    if (input.purpose === 'announcement' || input.purpose === 'discussion') {
      await channel.updatePartial({ set: { name: input.name } });
    }

    const loaded = await channel.query({ state: true, watch: false, messages: { limit: 0 } });
    const memberCount = typeof loaded.channel.member_count === 'number' ? loaded.channel.member_count : 0;
    const summary = summarize(channel);

    if (summary) return { ...summary, memberCount };

    return {
      channelType: input.channelType,
      channelId: input.channelId,
      name: input.name,
      purpose: input.purpose,
      cohortId: input.cohortId ?? null,
      memberCount,
      lastMessageAt: null
    };
  }

  async queryMemberChannels(userId: string, organizationId: string): Promise<MessagingChannelSummary[]> {
    return this.queryChannels({
      members: { $in: [userId] },
      organization_id: organizationId
    });
  }

  async queryOrganizationChannels(organizationId: string): Promise<MessagingChannelSummary[]> {
    return this.queryChannels({ organization_id: organizationId });
  }

  async inspectChannel(channelType: string, channelId: string): Promise<InspectedChannel | null> {
    const channel = this.client.channel(channelType, channelId);

    try {
      await channel.query({ state: true, watch: false, messages: { limit: 0 }, members: { limit: 100 } });
    } catch (error) {
      if (isMissing(error)) return null;

      throw error;
    }

    const summary = summarize(channel);
    const organizationId = asText(channelFields(channel).organization_id);

    if (!summary || !organizationId) return null;

    const memberIds = Object.values(channel.state.members ?? {})
      .map((member) => member.user_id || member.user?.id)
      .filter((id): id is string => Boolean(id));

    return {
      organizationId,
      purpose: asText(channelFields(channel).purpose),
      memberIds,
      summary
    };
  }

  async readMessages(channelType: string, channelId: string): Promise<TranscriptMessage[]> {
    const channel = this.client.channel(channelType, channelId);
    const pages: TranscriptMessage[][] = [];
    let olderThan: string | undefined;

    for (let page = 0; page < MESSAGE_PAGE_CAP; page += 1) {
      const messageQuery: { limit: number; id_lt?: string } = { limit: MESSAGE_PAGE };

      if (olderThan) messageQuery.id_lt = olderThan;

      const response = await channel.query({
        watch: false,
        state: true,
        messages: messageQuery
      });
      const batch = (response.messages ?? [])
        .map(toTranscript)
        .filter((message) => message.id)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));

      if (batch.length === 0) break;

      const oldestId = batch[0]?.id;

      if (!oldestId || oldestId === olderThan) break;

      pages.push(batch);
      olderThan = oldestId;

      if (batch.length < MESSAGE_PAGE) break;
    }

    const seen = new Set<string>();

    return pages
      .reverse()
      .flat()
      .filter((message) => {
        if (seen.has(message.id)) return false;

        seen.add(message.id);

        return true;
      });
  }

  async sendMessage(input: {
    channelType: string;
    channelId: string;
    userId: string;
    text: string;
    id?: string;
    parentId?: string;
  }): Promise<{ id: string }> {
    const channel = this.client.channel(input.channelType, input.channelId);
    const payload: Message = {
      text: input.text,
      user_id: input.userId,
      ...(input.id ? { id: input.id } : {}),
      ...(input.parentId ? { parent_id: input.parentId } : {})
    };
    const response = await channel.sendMessage(payload);
    const id = response.message.id;

    if (!id) {
      throw new Error('Stream did not return a message id');
    }

    return { id };
  }

  async removeChannelMember(channelType: string, channelId: string, userId: string): Promise<void> {
    const channel = this.client.channel(channelType, channelId);

    try {
      await channel.removeMembers([userId]);
    } catch (error) {
      if (isMissing(error)) return;

      throw error;
    }
  }

  async muteUser(mutedUserId: string, muterUserId: string): Promise<void> {
    await this.client.muteUser(mutedUserId, muterUserId);
  }

  async unmuteUser(mutedUserId: string, muterUserId: string): Promise<void> {
    await this.client.unmuteUser(mutedUserId, muterUserId);
  }

  verifyWebhook(rawBody: string, signature: string): boolean {
    return this.client.verifyWebhook(rawBody, signature);
  }

  private async queryChannels(filter: {
    organization_id: string;
    members?: { $in: string[] };
  }): Promise<MessagingChannelSummary[]> {
    const channels = await this.client.queryChannels(
      filter,
      { last_message_at: -1 },
      {
        limit: CHANNEL_QUERY_LIMIT,
        state: true,
        watch: false
      }
    );

    return channels.flatMap((channel) => {
      const summary = summarize(channel);

      return summary ? [summary] : [];
    });
  }
}

function memberUserId(member: { user_id?: string; user?: { id?: string } | null }): string {
  return member.user_id || member.user?.id || '';
}

function idBatches(ids: string[]): string[][] {
  const batches: string[][] = [];

  for (let index = 0; index < ids.length; index += MEMBER_BATCH) {
    batches.push(ids.slice(index, index + MEMBER_BATCH));
  }

  return batches;
}

async function listChannelMemberIds(channel: Channel): Promise<string[]> {
  const ids = new Set<string>();
  let afterId = '';

  for (let page = 0; page < MEMBER_PAGE_CAP; page += 1) {
    const options: { limit: number; user_id_gt?: string } = { limit: MEMBER_BATCH };

    if (afterId) options.user_id_gt = afterId;

    const response = await channel.queryMembers({}, { user_id: 1 }, options);
    const batch = response.members ?? [];

    if (batch.length === 0) break;

    const lastId = memberUserId(batch[batch.length - 1] ?? {});

    if (!lastId || lastId === afterId) break;

    for (const member of batch) {
      const id = memberUserId(member);

      if (id) ids.add(id);
    }

    afterId = lastId;

    if (batch.length < MEMBER_BATCH) break;
  }

  return [...ids];
}

async function reconcileChannelMembers(channel: Channel, input: EnsureMessagingChannel): Promise<void> {
  const current = new Set(await listChannelMemberIds(channel));
  const desired = new Set(input.memberIds.filter(Boolean));
  const kept = new Set(desired);

  for (const id of input.protectedMemberIds ?? []) {
    if (id) kept.add(id);
  }

  const missing = [...desired].filter((id) => !current.has(id));
  const extra = [...current].filter((id) => !kept.has(id));

  for (const batch of idBatches(missing)) {
    await channel.addMembers(batch);
  }

  for (const batch of idBatches(extra)) {
    await channel.removeMembers(batch);
  }
}

function isAlreadyExists(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const record = error as { code?: number; message?: string };

  return record.code === 4 || (record.message ?? '').toLowerCase().includes('already exists');
}

let gateway: StreamGateway | null = null;

export function getStreamGateway(): StreamGateway {
  if (gateway) return gateway;

  const apiKey = process.env.STREAM_API_KEY;
  const apiSecret = process.env.STREAM_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error('Stream credentials are not configured');
  }

  gateway = new StreamServerGateway(StreamChat.getInstance(apiKey, apiSecret));

  return gateway;
}

export function setStreamGateway(next: StreamGateway | null): void {
  gateway = next;
}
