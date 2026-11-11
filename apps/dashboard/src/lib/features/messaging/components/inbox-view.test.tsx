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
    channelProps: { current: {} as { doSendMessageRequest?: (channel: unknown, message: unknown) => Promise<unknown> } }
  };
});

vi.mock('stream-chat', () => ({
  StreamChat: {
    getInstance: () => harness.client
  }
}));

vi.mock('stream-chat-react', () => ({
  Chat: ({ children }: { children?: React.ReactNode }) => <div className="str-chat">{children}</div>,
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
      data: { name: 'mentor_dm' },
      state: { unreadCount: 2 }
    };
    const PreviewComponent = Preview;

    if (!PreviewComponent) return null;

    return <PreviewComponent channel={channel} />;
  },
  ChannelPreviewMessenger: ({
    channel
  }: {
    channel?: { data?: { name?: string }; state?: { unreadCount?: number } };
  }) => (
    <button type="button">
      {channel?.data?.name}
      {channel?.state?.unreadCount ? <span>{channel.state.unreadCount}</span> : null}
    </button>
  ),
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
  MessageList: ({
    customMessageActions
  }: {
    customMessageActions?: Record<
      string,
      (message: { id: string; text: string; user: { id: string; name: string } }) => void
    >;
  }) => {
    const message = { id: 'm1', text: 'Hello from the thread', user: { id: 'other', name: 'Ada' } };
    const actions = customMessageActions ?? {};

    return (
      <div>
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
  Thread: () => null
}));

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
        purpose: 'mentor_dm'
      }
    ],
    directory: [],
    brandColor: '#be1241',
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
      empty: 'No conversations yet'
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
  });

  it('keeps the channel list and the thread in separate panes and themes the brand color', async () => {
    render(<InboxView {...props()} />);

    const list = await screen.findByTestId('messaging-channel-list');
    const thread = screen.getByTestId('messaging-thread');

    expect(list.textContent).toContain('Bea Fellow');
    expect(list.textContent).toContain('2');
    expect(thread.textContent).not.toContain('Bea Fellow');
    expect(thread.textContent).toContain('Hello from the thread');
    expect(thread.querySelector('.str-chat__message--me')).toBeTruthy();
    expect(thread.querySelector('.str-chat__message--other')).toBeTruthy();
    expect(thread.querySelector('.str-chat__avatar')).toBeTruthy();
    expect(screen.getByTestId('messaging-stream').getAttribute('style')).toContain('#be1241');
    expect(harness.client.queryChannels).toHaveBeenCalled();
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

    const sent = await harness.channelProps.current.doSendMessageRequest?.(
      { type: 'mentor_dm', id: 'mdm' },
      { text: 'Hi', user: { id: 'me', name: 'Ada Mentor' } }
    );

    expect(onSend).toHaveBeenCalledWith('mentor_dm', 'mdm', 'Hi');
    expect(sent).toMatchObject({ message: { id: 'msg-1', text: 'Hi' } });
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
              purpose: 'announcement'
            }
          ]
        })}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Bea Fellow/ }));
    expect(screen.queryByRole('textbox', { name: 'Message' })).toBeNull();
  });
});
