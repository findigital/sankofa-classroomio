// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StreamChat } from 'stream-chat';
import { Channel, Chat, Message, Window } from 'stream-chat-react';

import { SenderMessage } from './inbox-view';

afterEach(() => {
  cleanup();
});

describe('SenderMessage with stream-chat-react', () => {
  it('reads the message from context when the UI is only given groupedByUser', async () => {
    const client = new StreamChat('test-key');
    client.userID = 'me';
    client.user = { id: 'me', name: 'Me' };
    client.getAppSettings = async () => ({ app: {} }) as Awaited<ReturnType<StreamChat['getAppSettings']>>;

    const channel = client.channel('messaging', 'room', { members: ['me', 'ada'] });
    channel.initialized = true;
    channel.state.membership = { role: 'member', user: { id: 'me' } } as typeof channel.state.membership;
    channel.state.members = {
      me: { user: { id: 'me', name: 'Me' } },
      ada: { user: { id: 'ada', name: 'Ada Fellow' } }
    } as typeof channel.state.members;

    const message = {
      id: 'message-ada',
      text: 'Hello from Ada',
      type: 'regular' as const,
      status: 'received' as const,
      user: { id: 'ada', name: 'Ada Fellow' },
      created_at: new Date('2026-11-01T12:00:00Z'),
      updated_at: new Date('2026-11-01T12:00:00Z')
    };

    render(
      <Chat client={client}>
        <Channel channel={channel} markReadOnMount={false}>
          <Window>
            <Message Message={SenderMessage} message={message} />
          </Window>
        </Channel>
      </Chat>
    );

    expect(await screen.findByText('Hello from Ada')).toBeTruthy();
    expect(document.querySelector('[data-testid="messaging-sender-message"]')).toBeTruthy();
  });
});
