export const SENDER_HUE_COUNT = 8;

const DIRECT_PURPOSES = new Set(['fellow_dm', 'mentor_dm']);

/**
 * Index into the eight sender hues. The same key always returns the same index.
 */
export function senderColorIndex(key: string) {
  let hash = 2166136261;

  for (const char of key) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) % SENDER_HUE_COUNT;
}

/**
 * Fill for an initials avatar. Text on this fill is `--primary-foreground`.
 */
export function senderColorVariable(key: string) {
  return `var(--messaging-sender-${senderColorIndex(key)})`;
}

/**
 * Mark key for a channel: the other member in a direct channel, otherwise the course.
 */
export function channelColorKey(input: {
  purpose?: string | null;
  cohortId?: string | null;
  memberIds?: string[];
  selfId?: string | null;
  fallback: string;
}) {
  if (input.purpose && DIRECT_PURPOSES.has(input.purpose)) {
    const otherMember = (input.memberIds ?? []).find((id) => id && id !== input.selfId);

    return otherMember || input.fallback;
  }

  return input.cohortId || input.fallback;
}
