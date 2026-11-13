import { describe, expect, it } from 'vitest';

import { ApiError } from '$lib/utils/services/api/types';
import { accountFailureFromError, accountRetryDelayMs, decideAccountFetch } from './account-fetch';

describe('decideAccountFetch', () => {
  it('keeps the session when the account API is rate limited', () => {
    expect(decideAccountFetch(429)).toBe('retry');
    expect(decideAccountFetch(503)).toBe('retry');
    expect(decideAccountFetch(0)).toBe('retry');
  });

  it('clears the session only when the account API says the user is signed out', () => {
    expect(decideAccountFetch(401)).toBe('signed_out');
    expect(decideAccountFetch(403)).toBe('keep_session');
    expect(decideAccountFetch(200)).toBe('ok');
  });
});

describe('accountFailureFromError', () => {
  it('reads status and Retry-After from a thrown ApiError', () => {
    const thrown = captureThrown(
      () =>
        new ApiError(
          'Too many requests',
          429,
          'Too Many Requests',
          new Response('slow down', { status: 429, headers: { 'Retry-After': '12' } })
        )
    );

    const failure = accountFailureFromError(thrown);
    expect(failure).toEqual({ kind: 'rate_limited', retryAfter: '12' });
    expect(accountRetryDelayMs(0, failure.retryAfter)).toBe(12_000);
  });

  it('keeps a thrown non-429 error on the unavailable retry', () => {
    const thrown = captureThrown(() => new Error('network down'));

    expect(accountFailureFromError(thrown)).toEqual({ kind: 'unavailable', retryAfter: null });
  });
});

function captureThrown(raise: () => Error): unknown {
  try {
    throw raise();
  } catch (error) {
    return error;
  }
}

describe('accountRetryDelayMs', () => {
  it('honors Retry-After seconds and HTTP dates', () => {
    expect(accountRetryDelayMs(0, '12')).toBe(12_000);

    const now = Date.parse('2026-11-13T04:00:00.000Z');
    expect(accountRetryDelayMs(0, 'Fri, 13 Nov 2026 04:00:08 GMT', now)).toBe(8_000);
  });

  it('backs off when the server does not say when to retry', () => {
    expect(accountRetryDelayMs(0, null)).toBe(1_000);
    expect(accountRetryDelayMs(1, null)).toBe(2_000);
    expect(accountRetryDelayMs(3, null)).toBe(8_000);
  });
});
