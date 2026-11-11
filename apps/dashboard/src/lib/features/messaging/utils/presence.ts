type UnreadChannel = {
  cid?: string;
  data?: { organization_id?: string };
  countUnread: () => number;
};

export function presenceChannelFilter(userId: string, organizationId: string, channelIds: readonly string[]) {
  return {
    cid: { $in: channelIds.length > 0 ? [...channelIds] : ['none'] },
    members: { $in: [userId] },
    organization_id: organizationId
  };
}

export function unreadInListedChannels(
  channels: readonly UnreadChannel[],
  allowedCids: ReadonlySet<string>,
  organizationId: string
) {
  let unread = 0;

  for (const channel of channels) {
    if (!channel.cid || !allowedCids.has(channel.cid)) continue;

    if (channel.data?.organization_id !== organizationId) continue;

    unread += channel.countUnread();
  }

  return unread;
}
