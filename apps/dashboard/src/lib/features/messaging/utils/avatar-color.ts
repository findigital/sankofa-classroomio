export const SENDER_HUE_COUNT = 16;

const DIRECT_PURPOSES = new Set(['fellow_dm', 'mentor_dm']);

export type ChannelColorMember = {
  id: string;
  name?: string | null;
};

/**
 * Index into the sender hues. The same key always returns the same index.
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
  return senderFillVariable(senderColorIndex(key));
}

/** CSS variable for a hue index. */
export function senderFillVariable(index: number) {
  const hue = ((index % SENDER_HUE_COUNT) + SENDER_HUE_COUNT) % SENDER_HUE_COUNT;

  return `var(--messaging-sender-${hue})`;
}

/**
 * One hue per member. Members are ordered by id; a hash collision takes the next free hue.
 */
export function distinctSenderIndexes(memberIds: string[]) {
  const ordered = [...new Set(memberIds.filter(Boolean))].sort();
  const used = new Set<number>();
  const assigned = new Map<string, number>();

  for (const id of ordered) {
    const preferred = senderColorIndex(id);
    let index = preferred;

    if (used.has(preferred)) {
      for (let step = 1; step < SENDER_HUE_COUNT; step += 1) {
        const next = (preferred + step) % SENDER_HUE_COUNT;

        if (!used.has(next)) {
          index = next;
          break;
        }
      }
    }

    used.add(index);
    assigned.set(id, index);
  }

  return assigned;
}

/**
 * Hue for one sender inside a channel. The sender is included even if membership has not loaded.
 */
export function senderIndexForMember(userId: string, memberIds: string[]) {
  const ids = memberIds.includes(userId) ? memberIds : [...memberIds, userId];

  return distinctSenderIndexes(ids).get(userId) ?? senderColorIndex(userId);
}

/**
 * Mark key for a channel. A direct channel uses the named counterpart, not safeguarding staff.
 * A cohort channel uses the course.
 */
export function channelColorKey(input: {
  purpose?: string | null;
  cohortId?: string | null;
  members?: ChannelColorMember[];
  selfId?: string | null;
  displayName?: string | null;
  fallback: string;
}) {
  if (input.purpose && DIRECT_PURPOSES.has(input.purpose)) {
    return directCounterpartId(input);
  }

  return input.cohortId || input.fallback;
}

function directCounterpartId(input: {
  members?: ChannelColorMember[];
  selfId?: string | null;
  displayName?: string | null;
  fallback: string;
}) {
  const others = (input.members ?? []).filter((member) => member.id && member.id !== input.selfId);
  const title = input.displayName?.trim().toLowerCase();

  if (title) {
    const named = others.find((member) => member.name?.trim().toLowerCase() === title);

    if (named) return named.id;
  }

  if (others.length === 1) return others[0]!.id;

  return input.fallback;
}
