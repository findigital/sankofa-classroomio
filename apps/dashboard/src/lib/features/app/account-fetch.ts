export const ACCOUNT_CACHE_TTL_MS = 20_000;

const MIN_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 60_000;

export type AccountFetchDecision = 'ok' | 'signed_out' | 'retry' | 'keep_session';

/**
 * A 429, a 5xx, or a network failure must not be treated as a signed-out session.
 * Only an explicit 401 clears the session.
 */
export function decideAccountFetch(status: number): AccountFetchDecision {
  if (status === 401) return 'signed_out';
  if (status === 429 || status === 0 || status >= 500) return 'retry';
  if (status >= 200 && status < 300) return 'ok';

  return 'keep_session';
}

export function accountRetryDelayMs(attempt: number, retryAfterHeader: string | null, now = Date.now()): number {
  const headerDelay = retryAfterDelayMs(retryAfterHeader, now);
  if (headerDelay != null) return Math.max(headerDelay, MIN_RETRY_DELAY_MS);

  const exponent = Math.min(Math.max(attempt, 0), 5);
  return Math.min(MIN_RETRY_DELAY_MS * 2 ** exponent, 30_000);
}

function retryAfterDelayMs(header: string | null, now: number): number | null {
  if (!header) return null;

  const trimmed = header.trim();
  if (!trimmed) return null;

  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RETRY_DELAY_MS);
  }

  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return null;

  return Math.min(Math.max(0, date - now), MAX_RETRY_DELAY_MS);
}
