import { StreamChat, type Channel, type Message } from 'stream-chat';

declare module 'stream-chat' {
  interface CustomChannelData {
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
  sendMessage(input: { channelType: string; channelId: string; userId: string; text: string }): Promise<{ id: string }>;
  muteUser(mutedUserId: string, muterUserId: string): Promise<void>;
  unmuteUser(mutedUserId: string, muterUserId: string): Promise<void>;
  verifyWebhook(rawBody: string, signature: string): boolean;
}

const MESSAGE_PAGE = 100;
const MESSAGE_PAGE_CAP = 20;
const CHANNEL_QUERY_LIMIT = 100;
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

  async ensureChannel(input: EnsureMessagingChannel): Promise<MessagingChannelSummary> {
    const channel = this.client.channel(input.channelType, input.channelId, {
      created_by_id: input.createdById,
      name: input.name,
      organization_id: input.organizationId,
      purpose: input.purpose,
      cohort_id: input.cohortId,
      staff_visible: true,
      members: input.memberIds
    } as Channel['data']);

    try {
      await channel.create();
    } catch (error) {
      if (!isMissing(error) && !isAlreadyExists(error)) {
        await channel.query({ state: true, watch: false, messages: { limit: 0 } });
      }
    }

    if (input.memberIds.length > 0) {
      await channel.addMembers(input.memberIds).catch(async () => {
        await channel.query({ state: true, watch: false, messages: { limit: 0 } });
      });
    }

    const summary = summarize(channel);

    if (summary) return summary;

    return {
      channelType: input.channelType,
      channelId: input.channelId,
      name: input.name,
      purpose: input.purpose,
      cohortId: input.cohortId ?? null,
      memberCount: input.memberIds.length,
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
      const response = await channel.query({
        watch: false,
        state: true,
        messages: {
          limit: MESSAGE_PAGE,
          ...(olderThan ? { id_lt: olderThan } : {})
        }
      });
      const batch = (response.messages ?? []).map(toTranscript).filter((message) => message.id);

      if (batch.length === 0) break;

      pages.push(batch);
      olderThan = batch[0]?.id;

      if (batch.length < MESSAGE_PAGE) break;
    }

    return pages.reverse().flat();
  }

  async sendMessage(input: {
    channelType: string;
    channelId: string;
    userId: string;
    text: string;
  }): Promise<{ id: string }> {
    const channel = this.client.channel(input.channelType, input.channelId);
    const payload: Message = { text: input.text, user_id: input.userId };
    const response = await channel.sendMessage(payload);
    const id = response.message.id;

    if (!id) {
      throw new Error('Stream did not return a message id');
    }

    return { id };
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
