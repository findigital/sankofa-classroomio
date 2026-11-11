import type { Event, StreamChat } from 'stream-chat';

import type { MessagingSession } from '../utils/types';
import '../utils/stream';

class MessagingPresence {
  unreadCount = $state(0);
  private client: StreamChat | null = null;
  private organizationId = '';
  private listening = false;

  async connect(session: MessagingSession, organizationId: string): Promise<StreamChat | null> {
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

    this.client = client;
    this.organizationId = organizationId;
    this.listen(client);

    await client.queryChannels(
      { members: { $in: [session.userId] }, organization_id: organizationId },
      { last_message_at: -1 },
      { watch: true, state: true, limit: 30 }
    );
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

    const channels = Object.values(client.activeChannels);
    let unread = 0;

    for (const channel of channels) {
      const data = channel.data as { organization_id?: string } | undefined;

      if (data?.organization_id !== organizationId) continue;

      unread += channel.countUnread();
    }

    this.unreadCount = unread;
  }
}

export const messagingPresence = new MessagingPresence();
