const DAY_MS = 24 * 60 * 60 * 1000;

export type PaceActivityAge = { kind: 'never' } | { kind: 'today' } | { kind: 'days'; days: number };

/** How the staff table should describe a fellow's last activity. */
export function paceActivityAge(value: string | null, now = new Date()): PaceActivityAge {
  if (!value) return { kind: 'never' };

  const then = new Date(value).getTime();

  if (!Number.isFinite(then)) return { kind: 'never' };

  const days = Math.floor((now.getTime() - then) / DAY_MS);

  if (days <= 0) return { kind: 'today' };

  return { kind: 'days', days };
}

/** Field names whose stored values differ. Used to summarize an audit row. */
export function changedSafeguardingFields(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  return Object.keys(after).filter((key) => before[key] !== after[key]);
}
