export const SENDER_COLOR_COUNT = 11;
export const COURSE_COLOR_COUNT = 8;

const DIRECT_PURPOSES = new Set(['fellow_dm', 'mentor_dm']);

export type ChannelColorMember = {
  id: string;
  name?: string | null;
};

/**
 * Index into the person palette. The same id always returns the same index.
 */
export function senderColorIndex(key: string) {
  return hashIndex(key, SENDER_COLOR_COUNT);
}

/**
 * Index into the muted course palette. The same course id always returns the same index.
 */
export function courseColorIndex(key: string) {
  return hashIndex(key, COURSE_COLOR_COUNT);
}

/** Person fill. Initials on this fill are white. */
export function senderColorVariable(key: string) {
  return senderFillVariable(senderColorIndex(key));
}

/** Muted course fill. Initials use the matching ink, not this fill as a solid. */
export function courseColorVariable(key: string) {
  return courseFillVariable(courseColorIndex(key));
}

/** CSS variable for a person palette index. */
export function senderFillVariable(index: number) {
  return `var(--messaging-sender-${paletteSlot(index, SENDER_COLOR_COUNT)})`;
}

/** CSS variable for a course palette index. */
export function courseFillVariable(index: number) {
  return `var(--messaging-course-${paletteSlot(index, COURSE_COLOR_COUNT)})`;
}

function hashIndex(key: string, count: number) {
  let hash = 2166136261;

  for (const char of key) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) % count;
}

function paletteSlot(index: number, count: number) {
  return ((index % count) + count) % count;
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
