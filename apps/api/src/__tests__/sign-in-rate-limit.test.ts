import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

const buckets = new Map<string, number>();

vi.mock('@cio/core/config/env', () => ({ env: { NODE_ENV: 'production' } }));

vi.mock('@hono/node-server/conninfo', () => ({
  getConnInfo: () => ({ remote: { address: '203.0.113.8' } })
}));

vi.mock('@cio/core/utils/redis/redis', () => ({
  redis: {},
  logRedisUnavailableOnce: vi.fn()
}));

vi.mock('@api/utils/redis/limiter', () => ({
  RedisRateLimiter: class {
    private maxRequests: number;

    constructor(_redis: unknown, _windowMs: number, maxRequests: number) {
      this.maxRequests = maxRequests;
    }

    async isAllowed(key: string) {
      const count = (buckets.get(key) ?? 0) + 1;
      buckets.set(key, count);

      return {
        allowed: count <= this.maxRequests,
        remaining: Math.max(0, this.maxRequests - count),
        resetTime: Date.now() + 10_000,
        reservationId: `${key}:${count}`
      };
    }
  }
}));

import { enforceEmailSignInRateLimit } from '@api/middlewares/sign-in-rate-limit';

function signInApp() {
  return new Hono().post('/api/auth/sign-in/email', async (c) => {
    const blocked = await enforceEmailSignInRateLimit(c, c.req.raw);
    if (blocked) return blocked;

    return c.json({ ok: true });
  });
}

function signIn(email: string, ip = '203.0.113.8') {
  return signInApp().request('/api/auth/sign-in/email', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-real-ip': ip
    },
    body: JSON.stringify({ email, password: 'secret' })
  });
}

describe('email sign-in rate limit', () => {
  beforeEach(() => {
    buckets.clear();
  });

  it('blocks the fourth attempt for one account and still lets other accounts on that IP sign in', async () => {
    const first = await signIn('fellow-1@example.com');
    const second = await signIn('fellow-1@example.com');
    const third = await signIn('fellow-1@example.com');
    const fourth = await signIn('fellow-1@example.com');
    const neighbor = await signIn('fellow-2@example.com');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(200);
    expect(fourth.status).toBe(429);
    expect(neighbor.status).toBe(200);
    expect(fourth.headers.get('Retry-After')).toBeTruthy();
  });

  it('lets fifteen fellows on one IP sign in within a minute and stops the thirty-first', async () => {
    const responses = [];
    for (let index = 1; index <= 31; index += 1) {
      responses.push(await signIn(`fellow-${index}@example.com`));
    }

    expect(responses.slice(0, 30).every((response) => response.status === 200)).toBe(true);
    expect(responses[30]?.status).toBe(429);
  });
});
