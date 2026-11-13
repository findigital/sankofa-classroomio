import { describe, expect, it } from 'vitest';

import { accountRetryDelayMs, decideAccountFetch } from './account-fetch';

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
