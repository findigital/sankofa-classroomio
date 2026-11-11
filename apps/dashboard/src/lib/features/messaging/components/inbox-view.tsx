import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
  MessageSimple,
  Thread,
  ThreadHeader as StreamThreadHeader,
  Window,
  useChatContext,
  type ChannelPreviewUIComponentProps,
  type MessageUIComponentProps,
  type ThreadHeaderProps
} from 'stream-chat-react';
import 'stream-chat-react/dist/css/v2/index.css';

import './stream-theme.css';
import './inbox.css';

import { channelColorKey, senderColorIndex, senderColorVariable } from '../utils/avatar-color';
import type { InboxViewProps } from '../utils/inbox-types';

export type { InboxViewProps } from '../utils/inbox-types';

type InboxPreviewValue = {
  names: Map<string, string>;
  images: Map<string, string>;
  cohortIds: Map<string, string>;
  purposes: Map<string, string>;
  onOpen: (channel: Channel) => void;
  emptyLabel: string;
  selectLabel: string;
  backLabel: string;
};

type OutgoingMessage = {
  id?: string;
  text?: string;
  parent_id?: string;
  user?: LocalMessage['user'];
};

const InboxPreview = createContext<InboxPreviewValue | null>(null);

const NARROW_QUERY = '(max-width: 767px)';
const MESSAGE_ACTIONS = ['react', 'reply'] as const;
const GROUP_WINDOW_MS = 5 * 60 * 1000;
const STREAM_THEME_LIGHT = 'str-chat__theme-light';
const STREAM_THEME_DARK = 'str-chat__theme-dark';

function narrowNow() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;

  return window.matchMedia(NARROW_QUERY).matches;
}

function channelKey(channel: { type?: string; id?: string }) {
  return `${channel.type ?? ''}:${channel.id ?? ''}`;
}

function channelMemberIds(channel: Channel) {
  const members = channel.state?.members ?? {};
  const ids: string[] = [];

  for (const member of Object.values(members)) {
    const id = member.user?.id;

    if (id) ids.push(id);
  }

  return ids;
}

function SenderMessage(props: MessageUIComponentProps) {
  const index = senderColorIndex(props.message.user?.id || 'unknown');

  return (
    <div className={`messaging-sender messaging-sender-${index}`} style={{ display: 'contents' }}>
      <MessageSimple {...props} />
    </div>
  );
}

function channelInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);

  if (words.length === 0) return '?';

  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();

  return words.map((word) => word[0]?.toUpperCase() ?? '').join('');
}

function channelImage(channel: Channel) {
  const image = (channel.data as { image?: string } | undefined)?.image;

  return safeMarkImage(image);
}

function safeMarkImage(image?: string) {
  if (!image) return;

  const value = image.trim();

  if (/^https:\/\//i.test(value)) return value;

  if (value.startsWith('/') && !value.startsWith('//')) return value;
}

// stream-chat-react shows Reply only when own_capabilities includes send-reply; the server omits that grant because sends go through the API.
function allowReplyUi(channel: Channel) {
  const data = (channel.data ?? {}) as { own_capabilities?: string[] };
  const capabilities = data.own_capabilities ?? [];

  if (capabilities.includes('send-reply')) return false;

  data.own_capabilities = [...capabilities, 'send-reply'];
  channel.data = data as Channel['data'];

  return true;
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

function streamThemeNow() {
  if (typeof document === 'undefined') return STREAM_THEME_LIGHT;

  return document.body.classList.contains('dark') ? STREAM_THEME_DARK : STREAM_THEME_LIGHT;
}

function useStreamTheme() {
  const [theme, setTheme] = useState(streamThemeNow);

  useEffect(() => {
    const sync = () => setTheme(streamThemeNow());

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    return () => observer.disconnect();
  }, []);

  return theme;
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

function CohortAvatar({ image, name, colorKey }: { image?: string; name?: string; colorKey: string }) {
  const safeImage = safeMarkImage(image);

  if (safeImage) {
    return <img alt="" className="messaging-inbox__mark" data-testid="messaging-channel-avatar" src={safeImage} />;
  }

  return (
    <span
      className="messaging-inbox__mark"
      data-testid="messaging-channel-avatar"
      aria-hidden="true"
      style={{ background: senderColorVariable(colorKey), color: 'var(--primary-foreground)' }}
    >
      {channelInitials(name ?? '')}
    </span>
  );
}

function NamedPreview(props: ChannelPreviewUIComponentProps) {
  const preview = useContext(InboxPreview);

  if (preview) applyDisplayName(props.channel, preview.names);

  allowReplyUi(props.channel);

  const key = channelKey(props.channel);
  const title = preview?.names.get(key);
  const image = preview?.images.get(key) || channelImage(props.channel);
  const cohortId = preview?.cohortIds.get(key) || (props.channel.data as { cohort_id?: string } | undefined)?.cohort_id;
  const purpose = preview?.purposes.get(key) || (props.channel.data as { purpose?: string } | undefined)?.purpose;
  const colorKey = channelColorKey({
    purpose,
    cohortId,
    memberIds: channelMemberIds(props.channel),
    selfId: props.channel.getClient()?.userID,
    fallback: key
  });

  return (
    <div onClick={() => preview?.onOpen(props.channel)}>
      <ChannelPreviewMessenger
        {...props}
        Avatar={(avatar) => (
          <CohortAvatar image={image || avatar.image} name={title || avatar.name} colorKey={colorKey} />
        )}
      />
    </div>
  );
}

function EmptyChannels() {
  const preview = useContext(InboxPreview);

  return <p className="messaging-inbox__empty">{preview?.emptyLabel}</p>;
}

function EmptyConversation() {
  const preview = useContext(InboxPreview);

  return (
    <p className="messaging-inbox__prompt" data-testid="messaging-empty-channel">
      {preview?.selectLabel}
    </p>
  );
}

function InboxThreadHeader(props: ThreadHeaderProps) {
  const narrow = useNarrowViewport();
  const preview = useContext(InboxPreview);

  if (!narrow) return <StreamThreadHeader {...props} />;

  return (
    <div className="messaging-inbox__mobile-thread">
      <button type="button" className="messaging-inbox__back" onClick={(event) => props.closeThread(event)}>
        {preview?.backLabel}
      </button>
      <StreamThreadHeader {...props} />
    </div>
  );
}

function InboxPanes(props: InboxViewProps) {
  const { client, setActiveChannel, channel: activeChannel } = useChatContext();
  const narrow = useNarrowViewport();
  const [openedKey, setOpenedKey] = useState<string | null>(null);
  const [, setReplyRevision] = useState(0);
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

  const images = useMemo(() => {
    const map = new Map<string, string>();

    for (const channel of props.channels) {
      if (channel.image) map.set(`${channel.channelType}:${channel.channelId}`, channel.image);
    }

    return map;
  }, [props.channels]);

  const cohortIds = useMemo(() => {
    const map = new Map<string, string>();

    for (const channel of props.channels) {
      if (channel.cohortId) map.set(`${channel.channelType}:${channel.channelId}`, channel.cohortId);
    }

    return map;
  }, [props.channels]);

  const purposes = useMemo(() => {
    const map = new Map<string, string>();

    for (const channel of props.channels) {
      if (channel.purpose) map.set(`${channel.channelType}:${channel.channelId}`, channel.purpose);
    }

    return map;
  }, [props.channels]);

  const allowedKey = props.channels.map((channel) => `${channel.channelType}:${channel.channelId}`).join('\n');

  const onOpen = useCallback((channel: Channel) => {
    openedChannel.current = channel;

    if (channel.id) setOpenedKey(`${channel.type}:${channel.id}`);
  }, []);

  const preview = useMemo<InboxPreviewValue>(
    () => ({
      names,
      images,
      cohortIds,
      purposes,
      onOpen,
      emptyLabel: props.labels.empty,
      selectLabel: props.labels.select,
      backLabel: props.labels.back
    }),
    [cohortIds, images, names, onOpen, props.labels.back, props.labels.empty, props.labels.select, purposes]
  );

  const filters = useMemo(() => {
    const allowed = allowedKey ? allowedKey.split('\n') : [];

    return {
      cid: { $in: allowed.length > 0 ? allowed : ['none'] },
      members: { $in: [props.userId] },
      organization_id: props.organizationId
    } as ChannelFilters;
  }, [allowedKey, props.organizationId, props.userId]);

  const keepAllowed = useCallback(
    (channels: Channel[]) => {
      const allowed = new Set(allowedKey ? allowedKey.split('\n') : []);

      return channels.filter((channel) => {
        applyDisplayName(channel, names);

        return allowed.has(channelKey(channel));
      });
    },
    [allowedKey, names]
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
      const allowed = allowedKey ? allowedKey.split('\n') : [];

      if (!client || allowed.length === 0) {
        setChannels([]);
        setHasNextPage(false);

        return;
      }

      const offset = queryType === 'load-more' ? currentChannels.length : 0;
      const found = await client.queryChannels(
        filters,
        { last_message_at: -1 },
        { state: true, watch: true, presence: true, limit: 30, offset }
      );
      const matched = keepAllowed(found);

      setChannels(queryType === 'load-more' ? [...currentChannels, ...matched] : matched);
      setHasNextPage(found.length === 30);
    },
    [allowedKey, client, filters, keepAllowed]
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
    async (channel: Channel, message: OutgoingMessage) => {
      const text = message.text?.trim() ?? '';

      if (!text || !channel.id) return;

      const id = await props.onSend(channel.type, channel.id, text, {
        id: message.id,
        parentId: message.parent_id
      });

      if (!id) throw new Error('Message was not sent');

      const createdAt = new Date();

      return {
        message: {
          id,
          text,
          type: 'regular' as const,
          user: message.user ?? { id: props.userId, name: props.userName },
          created_at: createdAt,
          updated_at: createdAt,
          ...(message.parent_id ? { parent_id: message.parent_id } : {})
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

  useEffect(() => {
    const channel = activeChannel ?? openedChannel.current;

    if (!channel) return;

    const apply = () => {
      if (allowReplyUi(channel)) setReplyRevision((revision) => revision + 1);
    };

    apply();

    if (typeof channel.on !== 'function') return;

    const subscription = channel.on(apply);

    return () => {
      subscription.unsubscribe();
    };
  }, [activeChannel, openedKey]);

  const threadChannel = activeChannel ?? openedChannel.current;

  if (threadChannel) allowReplyUi(threadChannel);

  const activeKey = openedKey ?? (activeChannel?.id ? `${activeChannel.type}:${activeChannel.id}` : null);
  const listed = activeKey
    ? props.channels.find((channel) => `${channel.channelType}:${channel.channelId}` === activeKey)
    : undefined;
  const purpose = listed?.purpose ?? (activeChannel?.data as { purpose?: string } | undefined)?.purpose;
  const canCompose =
    Boolean(activeKey) && props.disclosureAccepted && (purpose !== 'announcement' || props.canPostAnnouncements);
  const channelKind = purpose === 'fellow_dm' || purpose === 'mentor_dm' ? 'direct' : 'group';
  const showList = !narrow || !openedKey;
  const showThread = !narrow || Boolean(openedKey);

  function goBack() {
    openedChannel.current = null;
    setOpenedKey(null);
    setActiveChannel(undefined);
  }

  return (
    <InboxPreview.Provider value={preview}>
      <div className="messaging-inbox__panes">
        {showList ? (
          <aside className="messaging-inbox__list" data-testid="messaging-channel-list">
            <ChannelList
              filters={filters}
              sort={{ last_message_at: -1 }}
              options={{ state: true, watch: true, presence: true, limit: 30 }}
              allowNewMessagesFromUnfilteredChannels={false}
              channelRenderFilterFn={keepAllowed}
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
          <section
            className="messaging-inbox__thread"
            data-channel-kind={channelKind}
            data-compose={canCompose ? 'true' : 'false'}
            data-testid="messaging-thread"
          >
            {activeKey ? (
              <StreamChannel
                Message={SenderMessage}
                ThreadHeader={InboxThreadHeader}
                doSendMessageRequest={sendThroughApi}
              >
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
                  <MessageList
                    customMessageActions={messageActions}
                    maxTimeBetweenGroupedMessages={GROUP_WINDOW_MS}
                    messageActions={[...MESSAGE_ACTIONS]}
                  />
                  {canCompose ? <MessageInput /> : null}
                </Window>
                <Thread
                  additionalMessageListProps={{
                    customMessageActions: messageActions,
                    maxTimeBetweenGroupedMessages: GROUP_WINDOW_MS,
                    messageActions: [...MESSAGE_ACTIONS]
                  }}
                  messageActions={[...MESSAGE_ACTIONS]}
                />
              </StreamChannel>
            ) : (
              <EmptyConversation />
            )}
          </section>
        ) : null}
      </div>
    </InboxPreview.Provider>
  );
}

export function InboxView(props: InboxViewProps) {
  const client = useSharedChatClient(props.apiKey, props.token, props.userId, props.userName);
  const theme = useStreamTheme();

  if (!client) return <div className="messaging-inbox" data-testid="messaging-stream" />;

  return (
    <div className="messaging-inbox" data-testid="messaging-stream">
      <Chat client={client} theme={theme}>
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
