import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties
} from 'react';
import { createRoot } from 'react-dom/client';
import { StreamChat, type Channel, type ChannelFilters, type LocalMessage } from 'stream-chat';
import {
  Channel as StreamChannel,
  ChannelHeader,
  ChannelList,
  ChannelPreviewMessenger,
  Chat,
  MessageInput,
  MessageList,
  Thread,
  Window,
  useChatContext,
  type ChannelPreviewUIComponentProps
} from 'stream-chat-react';
import 'stream-chat-react/dist/css/v2/index.css';

import './inbox.css';

import type { InboxViewProps } from '../utils/inbox-types';

export type { InboxViewProps } from '../utils/inbox-types';

type InboxPreviewValue = {
  names: Map<string, string>;
  onOpen: (channel: Channel) => void;
  emptyLabel: string;
};

const InboxPreview = createContext<InboxPreviewValue | null>(null);

const NARROW_QUERY = '(max-width: 767px)';

function narrowNow() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;

  return window.matchMedia(NARROW_QUERY).matches;
}

function channelKey(channel: { type?: string; id?: string }) {
  return `${channel.type ?? ''}:${channel.id ?? ''}`;
}

function applyDisplayName(channel: Channel, names: Map<string, string>) {
  const name = names.get(channelKey(channel));

  if (!name) return;

  const data = (channel.data ?? {}) as { name?: string };
  data.name = name;
  channel.data = data as Channel['data'];
}

function useSharedChatClient(apiKey: string, token: string, userId: string, userName: string) {
  const [client, setClient] = useState<StreamChat | null>(null);

  useEffect(() => {
    let cancelled = false;
    const shared = StreamChat.getInstance(apiKey);

    void (async () => {
      if (shared.userID && shared.userID !== userId) {
        await shared.disconnectUser();
      }

      if (cancelled) return;

      if (shared.userID !== userId) {
        await shared.connectUser({ id: userId, name: userName }, token);
      }

      if (!cancelled) setClient(shared);
    })();

    return () => {
      cancelled = true;
    };
  }, [apiKey, token, userId, userName]);

  return client;
}

function useNarrowViewport() {
  const [narrow, setNarrow] = useState(narrowNow);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;

    const query = window.matchMedia(NARROW_QUERY);
    const update = () => setNarrow(query.matches);

    update();
    query.addEventListener('change', update);

    return () => query.removeEventListener('change', update);
  }, []);

  return narrow;
}

function NamedPreview(props: ChannelPreviewUIComponentProps) {
  const preview = useContext(InboxPreview);

  if (preview) applyDisplayName(props.channel, preview.names);

  return (
    <div onClick={() => preview?.onOpen(props.channel)}>
      <ChannelPreviewMessenger {...props} />
    </div>
  );
}

function EmptyChannels() {
  const preview = useContext(InboxPreview);

  return <p className="messaging-inbox__empty">{preview?.emptyLabel}</p>;
}

function InboxPanes(props: InboxViewProps) {
  const { client, setActiveChannel, channel: activeChannel } = useChatContext();
  const narrow = useNarrowViewport();
  const [openedKey, setOpenedKey] = useState<string | null>(null);
  const openedChannel = useRef<Channel | null>(null);
  const activeChannelRef = useRef(activeChannel);
  activeChannelRef.current = activeChannel;

  const names = useMemo(() => {
    const map = new Map<string, string>();

    for (const channel of props.channels) {
      if (channel.name) map.set(`${channel.channelType}:${channel.channelId}`, channel.name);
    }

    return map;
  }, [props.channels]);

  const onOpen = useCallback((channel: Channel) => {
    openedChannel.current = channel;

    if (channel.id) setOpenedKey(`${channel.type}:${channel.id}`);
  }, []);

  const preview = useMemo<InboxPreviewValue>(
    () => ({ names, onOpen, emptyLabel: props.labels.empty }),
    [names, onOpen, props.labels.empty]
  );

  const queryChannels = useCallback(
    async ({
      currentChannels,
      queryType,
      setChannels,
      setHasNextPage
    }: {
      currentChannels: Channel[];
      queryType: 'reload' | 'load-more';
      setChannels: (channels: Channel[]) => void;
      setHasNextPage: (hasNext: boolean) => void;
    }) => {
      if (!client) {
        setChannels([]);
        setHasNextPage(false);

        return;
      }

      const offset = queryType === 'load-more' ? currentChannels.length : 0;
      const found = await client.queryChannels(
        { members: { $in: [props.userId] }, organization_id: props.organizationId },
        { last_message_at: -1 },
        { state: true, watch: true, presence: true, limit: 30, offset }
      );

      for (const channel of found) applyDisplayName(channel, names);

      setChannels(queryType === 'load-more' ? [...currentChannels, ...found] : found);
      setHasNextPage(found.length === 30);
    },
    [client, names, props.organizationId, props.userId]
  );

  useEffect(() => {
    const focusKey = props.focusKey;

    if (!focusKey || !client) return;

    const separator = focusKey.indexOf(':');

    if (separator <= 0) return;

    const type = focusKey.slice(0, separator);
    const id = focusKey.slice(separator + 1);
    const channel = client.channel(type, id);
    applyDisplayName(channel, names);

    let cancelled = false;

    void channel.watch().then(() => {
      if (cancelled) return;

      openedChannel.current = channel;
      setOpenedKey(focusKey);
      setActiveChannel(channel);
    });

    return () => {
      cancelled = true;
    };
  }, [client, names, props.focusKey, setActiveChannel]);

  const sendThroughApi = useCallback(
    async (channel: Channel, message: { text?: string; user?: LocalMessage['user'] }) => {
      const text = message.text?.trim() ?? '';

      if (!text) return;

      const id = await props.onSend(channel.type, channel.id ?? '', text);

      if (!id) throw new Error('Message was not sent');

      const createdAt = new Date();

      return {
        message: {
          id,
          text,
          type: 'regular' as const,
          user: message.user ?? { id: props.userId, name: props.userName },
          created_at: createdAt,
          updated_at: createdAt
        }
      } as Awaited<ReturnType<Channel['sendMessage']>>;
    },
    [props.onSend, props.userId, props.userName]
  );

  const messageActions = useMemo(
    () => ({
      [props.labels.flag]: (message: LocalMessage) => {
        const channel = openedChannel.current ?? activeChannelRef.current;

        if (!channel?.id || !message.id) return;

        props.onFlag(channel.type, channel.id, message.id);
      },
      [props.labels.mute]: (message: LocalMessage) => {
        const authorId = message.user?.id;

        if (!authorId || authorId === props.userId) return;

        props.onMute(authorId);
      }
    }),
    [props.labels.flag, props.labels.mute, props.onFlag, props.onMute, props.userId]
  );

  const activeKey = openedKey ?? (activeChannel?.id ? `${activeChannel.type}:${activeChannel.id}` : null);
  const listed = activeKey
    ? props.channels.find((channel) => `${channel.channelType}:${channel.channelId}` === activeKey)
    : undefined;
  const purpose = listed?.purpose ?? (activeChannel?.data as { purpose?: string } | undefined)?.purpose;
  const canCompose =
    Boolean(activeKey) && props.disclosureAccepted && (purpose !== 'announcement' || props.canPostAnnouncements);
  const showList = !narrow || !openedKey;
  const showThread = !narrow || Boolean(openedKey);

  function goBack() {
    openedChannel.current = null;
    setOpenedKey(null);
    setActiveChannel(undefined);
  }

  const filters = {
    members: { $in: [props.userId] },
    organization_id: props.organizationId
  } as ChannelFilters;

  return (
    <InboxPreview.Provider value={preview}>
      <div className="messaging-inbox__panes">
        {showList ? (
          <aside className="messaging-inbox__list" data-testid="messaging-channel-list">
            <ChannelList
              filters={filters}
              sort={{ last_message_at: -1 }}
              options={{ state: true, watch: true, presence: true, limit: 30 }}
              customQueryChannels={queryChannels}
              Preview={NamedPreview}
              EmptyStateIndicator={EmptyChannels}
              setActiveChannelOnMount={false}
            />
            {props.directory.length > 0 ? (
              <div className="messaging-inbox__directory">
                <h2>{props.labels.directory}</h2>
                <ul>
                  {props.directory.map((person) => (
                    <li key={person.profileId}>
                      <span>{person.name}</span>
                      <button type="button" onClick={() => props.onOpenDirect(person.profileId)}>
                        {props.labels.open}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>
        ) : null}
        {showThread ? (
          <section className="messaging-inbox__thread" data-testid="messaging-thread">
            <StreamChannel doSendMessageRequest={sendThroughApi}>
              <Window>
                <div className="messaging-inbox__header" data-testid="messaging-channel-header">
                  {narrow && openedKey ? (
                    <button type="button" className="messaging-inbox__back" onClick={goBack}>
                      {props.labels.back}
                    </button>
                  ) : null}
                  <ChannelHeader />
                  {props.roleIsAdmin && activeKey ? (
                    <div className="messaging-inbox__exports">
                      <button
                        type="button"
                        className="messaging-inbox__export"
                        onClick={() => {
                          const channelType = listed?.channelType ?? activeChannel?.type;
                          const channelId = listed?.channelId ?? activeChannel?.id;

                          if (!channelType || !channelId) return;

                          props.onExport(channelType, channelId, 'json');
                        }}
                      >
                        {props.labels.export}
                      </button>
                      <button
                        type="button"
                        className="messaging-inbox__export"
                        onClick={() => {
                          const channelType = listed?.channelType ?? activeChannel?.type;
                          const channelId = listed?.channelId ?? activeChannel?.id;

                          if (!channelType || !channelId) return;

                          props.onExport(channelType, channelId, 'csv');
                        }}
                      >
                        {props.labels.exportCsv}
                      </button>
                    </div>
                  ) : null}
                </div>
                <MessageList customMessageActions={messageActions} messageActions={['react']} />
                {canCompose ? <MessageInput /> : null}
              </Window>
              <Thread />
            </StreamChannel>
          </section>
        ) : null}
      </div>
    </InboxPreview.Provider>
  );
}

export function InboxView(props: InboxViewProps) {
  const client = useSharedChatClient(props.apiKey, props.token, props.userId, props.userName);
  const themeStyle = {
    '--str-chat__primary-color': props.brandColor,
    '--str-chat__active-primary-color': props.brandColor,
    '--str-chat__own-message-bubble-background-color': props.brandColor,
    '--str-chat__own-message-bubble-color': '#ffffff',
    '--str-chat__on-primary-color': '#ffffff',
    '--str-chat__channel-list-background-color': '#f4f6f8',
    '--str-chat__channel-preview-background-color': '#f4f6f8',
    '--str-chat__message-list-background-color': '#ffffff',
    '--str-chat__message-bubble-background-color': '#eef2f6',
    '--str-chat__channel-background-color': '#ffffff'
  } as CSSProperties;

  if (!client) return <div className="messaging-inbox" data-testid="messaging-stream" />;

  return (
    <div className="messaging-inbox" style={themeStyle} data-testid="messaging-stream">
      <Chat client={client} theme="str-chat__theme-light">
        <InboxPanes {...props} />
      </Chat>
    </div>
  );
}

/** Mounts the Stream inbox into a Svelte host. Call `render` again when props change. */
export function mountInbox(host: HTMLElement) {
  const root = createRoot(host);

  return {
    render(next: InboxViewProps) {
      root.render(<InboxView {...next} />);
    },
    destroy() {
      root.unmount();
    }
  };
}
