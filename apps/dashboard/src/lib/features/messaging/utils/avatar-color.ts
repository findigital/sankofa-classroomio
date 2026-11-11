const MARK_COLOR_TOKENS = ['--chart-2', '--chart-3', '--chart-4', '--chart-5', '--sidebar-primary'] as const;

/** Stable on-brand fill for a cohort mark. The same key always maps to the same token. */
export function cohortMarkColor(key: string) {
  let hash = 2166136261;

  for (const char of key) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  const token = MARK_COLOR_TOKENS[(hash >>> 0) % MARK_COLOR_TOKENS.length];

  return `var(${token})`;
}
