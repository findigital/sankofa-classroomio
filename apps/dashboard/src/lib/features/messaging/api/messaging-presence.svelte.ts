import type { Event, StreamChat } from 'stream-chat';

import { presenceChannelFilter, unreadInListedChannels } from '../utils/presence';
import type { MessagingSession } from '../utils/types';
import '../utils/stream';

class MessagingPresence {
  unreadCount = $state(0);
  private client: StreamChat | null = null;
  private organizationId = '';
  private allowedCids = new Set<string>();
  private listening = false;
  private requestId = 0;

  async connect(
    session: MessagingSession,
    organizationId: string,
    channelIds: readonly string[]
  ): Promise<StreamChat | null> {
    if (typeof window === 'undefined') return null;

    const { StreamChat } = await import('stream-chat');
    const client = StreamChat.getInstance(session.apiKey);

    if (client.userID && client.userID !== session.userId) {
      await client.disconnectUser();
      this.listening = false;
    }

    if (client.userID !== session.userId) {
      await client.connectUser({ id: session.userId, name: session.userName }, session.token);
    }

    const requestId = ++this.requestId;
    this.client = client;
    this.organizationId = organizationId;
    this.allowedCids = new Set(channelIds);
    this.listen(client);

    await client.queryChannels(
      presenceChannelFilter(session.userId, organizationId, channelIds),
      { last_message_at: -1 },
      { watch: true, state: true, limit: 30 }
    );

    if (requestId !== this.requestId) return client;

    this.refreshUnread();

    return client;
  }

  onMessage(handler: (event: Event) => void): () => void {
    const client = this.client;

    if (!client) return () => undefined;

    const subscription = client.on('message.new', handler);

    return () => subscription.unsubscribe();
  }

  private listen(client: StreamChat) {
    if (this.listening) return;

    const refresh = () => this.refreshUnread();
    client.on('message.new', refresh);
    client.on('notification.message_new', refresh);
    client.on('notification.mark_read', refresh);
    client.on('message.read', refresh);
    this.listening = true;
  }

  private refreshUnread() {
    const client = this.client;
    const organizationId = this.organizationId;

    if (!client) {
      this.unreadCount = 0;

      return;
    }

    this.unreadCount = unreadInListedChannels(Object.values(client.activeChannels), this.allowedCids, organizationId);
  }
}

export const messagingPresence = new MessagingPresence();
