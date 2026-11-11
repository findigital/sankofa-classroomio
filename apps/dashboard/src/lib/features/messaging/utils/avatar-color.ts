export const SENDER_COLOR_COUNT = 12;

const DIRECT_PURPOSES = new Set(['fellow_dm', 'mentor_dm']);

export type ChannelColorMember = {
  id: string;
  name?: string | null;
};

/**
 * Index into the sender palette. The same id always returns the same index.
 */
export function senderColorIndex(key: string) {
  let hash = 2166136261;

  for (const char of key) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) % SENDER_COLOR_COUNT;
}

/** Initials fill for a person or a course. Text on this fill is white. */
export function senderColorVariable(key: string) {
  return senderFillVariable(senderColorIndex(key));
}

/** CSS variable for a palette index. */
export function senderFillVariable(index: number) {
  const hue = ((index % SENDER_COLOR_COUNT) + SENDER_COLOR_COUNT) % SENDER_COLOR_COUNT;

  return `var(--messaging-sender-${hue})`;
}

/**
 * Direct channels use the named counterpart. Cohort channels use the course id.
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
