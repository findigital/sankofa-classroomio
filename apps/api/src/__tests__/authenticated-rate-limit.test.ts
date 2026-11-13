import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { AuthSession } from '@api/types/auth';

const limits: number[] = [];

vi.mock('@cio/core/config/env', () => ({ env: { NODE_ENV: 'production' } }));

vi.mock('@cio/core/utils/redis/redis', () => ({
  redis: {},
  logRedisUnavailableOnce: vi.fn()
}));

vi.mock('@api/utils/redis/limiter', () => ({
  RedisRateLimiter: class {
    constructor(_redis: unknown, _windowMs: number, maxRequests: number) {
      limits.push(maxRequests);
    }

    async isAllowed() {
      return { allowed: true, remaining: 1, resetTime: Date.now() + 1000, reservationId: '1' };
    }
  }
}));

import rateLimiter from '@api/middlewares/rate-limiter';
import { AUTHENTICATED_MAX_REQUESTS, DEFAULT_MAX_REQUESTS } from '@api/constants/rate-limiter';

function appAs(userId: string | null) {
  return new Hono<AuthSession>()
    .use('*', async (c, next) => {
      if (userId) c.set('user', { id: userId } as AuthSession['Variables']['user']);
      await next();
    })
    .use('*', rateLimiter)
    .get('/course/:courseId', (c) => c.json({ ok: true }))
    .get('/organization', (c) => c.json({ ok: true }))
    .get('/api/auth/get-session', (c) => c.json({ ok: true }));
}

describe('authenticated API rate limit', () => {
  beforeEach(() => {
    limits.length = 0;
  });

  it('gives a signed-in user a higher ceiling than an anonymous IP', async () => {
    expect((await appAs('user-1').request('/course/course-1')).status).toBe(200);
    expect(limits).toEqual([AUTHENTICATED_MAX_REQUESTS]);

    limits.length = 0;
    expect((await appAs(null).request('/course/course-1')).status).toBe(200);
    expect(limits).toEqual([DEFAULT_MAX_REQUESTS]);
  });

  it('does not count session lookups, and keeps anonymous org lookup above the default', async () => {
    expect((await appAs('user-1').request('/api/auth/get-session')).status).toBe(200);
    expect(limits).toEqual([]);

    expect((await appAs(null).request('/organization')).status).toBe(200);
    expect(limits).toEqual([500]);
  });
});
