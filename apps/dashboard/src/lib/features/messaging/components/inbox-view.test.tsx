// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => {
  const client = {
    userID: 'me',
    connectUser: vi.fn().mockResolvedValue(undefined),
    disconnectUser: vi.fn().mockResolvedValue(undefined),
    queryChannels: vi.fn().mockResolvedValue([]),
    channel: vi.fn((type: string, id: string) => ({
      type,
      id,
      data: {},
      watch: vi.fn().mockResolvedValue(undefined)
    })),
    on: vi.fn(),
    off: vi.fn()
  };

  return {
    client,
    channelProps: {
      current: {} as { doSendMessageRequest?: (channel: unknown, message: unknown) => Promise<unknown> }
    },
    messageListProps: { current: {} as { maxTimeBetweenGroupedMessages?: number } },
    threadListProps: { current: {} as { maxTimeBetweenGroupedMessages?: number } },
    previewChannel: null as null | {
      data: { name?: string; own_capabilities?: string[] };
      update: ReturnType<typeof vi.fn>;
      updatePartial: ReturnType<typeof vi.fn>;
    }
  };
});

vi.mock('stream-chat', () => ({
  StreamChat: {
    getInstance: () => harness.client
  }
}));

vi.mock('stream-chat-react', () => ({
  Chat: ({ children, theme }: { children?: React.ReactNode; theme?: string }) => (
    <div className={`str-chat ${theme ?? ''}`}>{children}</div>
  ),
  useChatContext: () => ({
    client: harness.client,
    channel: null,
    setActiveChannel: vi.fn()
  }),
  ChannelList: ({
    Preview,
    customQueryChannels
  }: {
    Preview?: React.ComponentType<{
      channel: { type: string; id: string; data: { name?: string }; state?: { unreadCount?: number } };
    }>;
    customQueryChannels?: (args: {
      currentChannels: unknown[];
      queryType: string;
      setChannels: (channels: unknown[]) => void;
      setHasNextPage: (hasNext: boolean) => void;
    }) => Promise<void>;
  }) => {
    void customQueryChannels?.({
      currentChannels: [],
      queryType: 'reload',
      setChannels: () => undefined,
      setHasNextPage: () => undefined
    });

    const channel = {
      type: 'mentor_dm',
      id: 'mdm',
      data: { name: 'mentor_dm', own_capabilities: ['read-channel', 'send-reaction'] },
      state: {
        unreadCount: 2,
        members: {
          staff: { user: { id: 'staff-amara', name: 'Amara Admin' } },
          me: { user: { id: 'me', name: 'Ada Mentor' } },
          ada: { user: { id: 'ada-fellow', name: 'Bea Fellow', online: true } }
        }
      },
      getClient: () => harness.client,
      on: vi.fn(() => ({ unsubscribe: vi.fn() })),
      update: vi.fn(),
      updatePartial: vi.fn()
    };
    harness.previewChannel = channel;
    const PreviewComponent = Preview;

    if (!PreviewComponent) return null;

    return <PreviewComponent channel={channel} />;
  },
  ChannelPreviewMessenger: ({
    channel,
    Avatar
  }: {
    channel?: { data?: { name?: string }; state?: { unreadCount?: number } };
    Avatar?: React.ComponentType<{ name?: string; image?: string }>;
  }) => (
    <button type="button">
      {Avatar ? <Avatar name={channel?.data?.name} /> : null}
      {channel?.data?.name}
      {channel?.state?.unreadCount ? <span>{channel.state.unreadCount}</span> : null}
    </button>
  ),
  ThreadHeader: () => <div>Thread</div>,
  Channel: ({
    children,
    doSendMessageRequest
  }: {
    children?: React.ReactNode;
    doSendMessageRequest?: (channel: unknown, message: unknown) => Promise<unknown>;
  }) => {
    harness.channelProps.current = { doSendMessageRequest };

    return <div>{children}</div>;
  },
  Window: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  ChannelHeader: () => <h2>Conversation</h2>,
  MessageSimple: () => null,
  MessageList: ({
    customMessageActions,
    maxTimeBetweenGroupedMessages,
    messageActions
  }: {
    customMessageActions?: Record<
      string,
      (message: { id: string; text: string; user: { id: string; name: string } }) => void
    >;
    maxTimeBetweenGroupedMessages?: number;
    messageActions?: string[];
  }) => {
    harness.messageListProps.current = { maxTimeBetweenGroupedMessages };
    const message = { id: 'm1', text: 'Hello from the thread', user: { id: 'other', name: 'Ada' } };
    const actions = customMessageActions ?? {};

    return (
      <div>
        <div data-testid="message-actions">{(messageActions ?? []).join(',')}</div>
        <div className="str-chat__message str-chat__message--me">Mine</div>
        <div className="str-chat__message str-chat__message--other">
          <span className="str-chat__avatar">A</span>
          <span className="str-chat__message-timestamp">10:00</span>
          Hello from the thread
        </div>
        {Object.entries(actions).map(([label, action]) => (
          <button key={label} type="button" onClick={() => action(message)}>
            {label}
          </button>
        ))}
      </div>
    );
  },
  MessageInput: () => <textarea aria-label="Message" />,
  Thread: ({
    additionalMessageListProps,
    messageActions
  }: {
    additionalMessageListProps?: { maxTimeBetweenGroupedMessages?: number };
    messageActions?: string[];
  }) => {
    harness.threadListProps.current = additionalMessageListProps ?? {};

    return <div data-testid="messaging-stream-thread">{(messageActions ?? []).join(',')}</div>;
  }
}));

import { senderFillVariable, senderIndexForMember } from '../utils/avatar-color';
import { InboxView, type InboxViewProps } from './inbox-view';

function installMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false
    })
  });
}

function props(overrides: Partial<InboxViewProps> = {}): InboxViewProps {
  return {
    apiKey: 'key',
    token: 'token',
    userId: 'me',
    userName: 'Ada Mentor',
    organizationId: 'org-1',
    channels: [
      {
        channelType: 'mentor_dm',
        channelId: 'mdm',
        name: 'Bea Fellow',
        purpose: 'mentor_dm',
        cohortId: null,
        image: null
      }
    ],
    directory: [],
    disclosureAccepted: true,
    canPostAnnouncements: false,
    roleIsAdmin: false,
    focusKey: null,
    labels: {
      flag: 'Flag',
      mute: 'Mute',
      back: 'Back',
      directory: 'Directory',
      open: 'Open',
      export: 'Export',
      exportCsv: 'Export CSV',
      empty: 'No conversations yet',
      select: 'Choose a conversation',
      online: 'Online',
      offline: 'Offline',
      supervised: 'Supervised'
    },
    onSend: vi.fn().mockResolvedValue('msg-1'),
    onFlag: vi.fn(),
    onMute: vi.fn(),
    onOpenDirect: vi.fn(),
    onExport: vi.fn(),
    ...overrides
  };
}

describe('Stream inbox', () => {
  beforeEach(() => {
    installMatchMedia(false);
    harness.channelProps.current = {};
    harness.messageListProps.current = {};
    harness.threadListProps.current = {};
    harness.previewChannel = null;
  });

  it('keeps the channel list and the thread in separate panes', async () => {
    render(<InboxView {...props()} />);

    const list = await screen.findByTestId('messaging-channel-list');
    const thread = screen.getByTestId('messaging-thread');

    expect(list.textContent).toContain('Bea Fellow');
    expect(list.textContent).toContain('BF');
    expect(list.querySelector('[data-testid="messaging-channel-avatar"]')?.getAttribute('style')).toContain(
      senderFillVariable(senderIndexForMember('ada-fellow', ['staff-amara', 'me', 'ada-fellow']))
    );
    expect(harness.previewChannel?.data.own_capabilities).toEqual(
      expect.arrayContaining(['read-channel', 'send-reaction', 'send-reply'])
    );
    expect(harness.previewChannel?.update).not.toHaveBeenCalled();
    expect(harness.previewChannel?.updatePartial).not.toHaveBeenCalled();
    expect(list.textContent).toContain('2');
    expect(thread.textContent).toContain('Choose a conversation');
    expect(thread.textContent).not.toContain('Hello from the thread');
    const stream = screen.getByTestId('messaging-stream').querySelector('.str-chat');
    expect(stream?.className).toContain('str-chat__theme-light');
    expect(stream?.getAttribute('style') ?? '').not.toMatch(/#(?:[0-9a-f]{3}|[0-9a-f]{6})/i);
    expect(harness.client.queryChannels).toHaveBeenCalledWith(
      expect.objectContaining({ cid: { $in: ['mentor_dm:mdm'] } }),
      { last_message_at: -1 },
      expect.objectContaining({ limit: 30 })
    );

    fireEvent.click(screen.getByRole('button', { name: /Bea Fellow/ }));

    expect(thread.textContent).toContain('Hello from the thread');
    expect(thread.getAttribute('data-channel-kind')).toBe('direct');
    expect(screen.getByTestId('messaging-dm-header').textContent).toContain('Bea Fellow');
    expect(screen.getByTestId('messaging-dm-header').textContent).toContain('Online');
    expect(screen.getByTestId('messaging-dm-header').textContent).toContain('Supervised');
    expect(screen.getByTestId('messaging-dm-header').textContent).not.toContain('members');
    expect(screen.getByTestId('messaging-dm-header').textContent).not.toContain('Amara');
    expect(
      screen
        .getByTestId('messaging-dm-header')
        .querySelector('[data-testid="messaging-channel-avatar"]')
        ?.getAttribute('style')
    ).toContain(senderFillVariable(senderIndexForMember('ada-fellow', ['staff-amara', 'me', 'ada-fellow'])));
    expect(harness.messageListProps.current.maxTimeBetweenGroupedMessages).toBe(5 * 60 * 1000);
    expect(harness.threadListProps.current.maxTimeBetweenGroupedMessages).toBe(5 * 60 * 1000);
    expect(thread.querySelector('.str-chat__message--me')).toBeTruthy();
    expect(thread.querySelector('.str-chat__message--other')).toBeTruthy();
    expect(screen.getByTestId('message-actions').textContent).toBe('react,reply');
  });

  it('sends through the app API and flags or mutes from the message actions', async () => {
    const onSend = vi.fn().mockResolvedValue('msg-1');
    const onFlag = vi.fn();
    const onMute = vi.fn();

    render(<InboxView {...props({ onSend, onFlag, onMute })} />);
    fireEvent.click(await screen.findByRole('button', { name: /Bea Fellow/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Flag' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));

    expect(onFlag).toHaveBeenCalledWith('mentor_dm', 'mdm', 'm1');
    expect(onMute).toHaveBeenCalledWith('other');

    const clientMessageId = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
    const parentId = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';
    const sent = await harness.channelProps.current.doSendMessageRequest?.(
      { type: 'mentor_dm', id: 'mdm' },
      { id: clientMessageId, parent_id: parentId, text: 'Hi', user: { id: 'me', name: 'Ada Mentor' } }
    );

    expect(onSend).toHaveBeenCalledWith('mentor_dm', 'mdm', 'Hi', { id: clientMessageId, parentId });
    expect(sent).toMatchObject({ message: { id: 'msg-1', parent_id: parentId, text: 'Hi' } });
    expect(screen.getByTestId('messaging-stream-thread').textContent).toContain('reply');
  });

  it('shows a course image on the cohort mark when one is available', async () => {
    render(
      <InboxView
        {...props({
          channels: [
            {
              channelType: 'mentor_dm',
              channelId: 'mdm',
              name: 'Bea Fellow',
              purpose: 'discussion',
              cohortId: 'cohort-1',
              image: 'https://cdn.example/react.png'
            }
          ]
        })}
      />
    );

    const avatar = await screen.findByTestId('messaging-channel-avatar');

    expect(avatar.tagName).toBe('IMG');
    expect(avatar.getAttribute('src')).toBe('https://cdn.example/react.png');
  });

  it('uses the channel list as its own screen on a narrow viewport and returns from the thread', async () => {
    installMatchMedia(true);
    render(<InboxView {...props()} />);

    expect(await screen.findByTestId('messaging-channel-list')).toBeTruthy();
    expect(screen.queryByTestId('messaging-thread')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Bea Fellow/ }));

    expect(screen.queryByTestId('messaging-channel-list')).toBeNull();
    expect(screen.getByTestId('messaging-thread')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByTestId('messaging-channel-list')).toBeTruthy();
    expect(screen.queryByTestId('messaging-thread')).toBeNull();
  });

  it('hides the composer until the notice is accepted and on announcement channels', async () => {
    const { rerender } = render(<InboxView {...props({ disclosureAccepted: false })} />);

    fireEvent.click(await screen.findByRole('button', { name: /Bea Fellow/ }));
    expect(screen.queryByRole('textbox', { name: 'Message' })).toBeNull();

    rerender(
      <InboxView
        {...props({
          disclosureAccepted: true,
          canPostAnnouncements: false,
          channels: [
            {
              channelType: 'mentor_dm',
              channelId: 'mdm',
              name: 'Bea Fellow',
              purpose: 'announcement',
              cohortId: null,
              image: null
            }
          ]
        })}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Bea Fellow/ }));
    expect(screen.queryByRole('textbox', { name: 'Message' })).toBeNull();
  });
});
