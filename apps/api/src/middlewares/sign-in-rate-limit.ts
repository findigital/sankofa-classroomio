import type { Context } from 'hono';

import {
  SIGN_IN_EMAIL_MAX,
  SIGN_IN_EMAIL_WINDOW_MS,
  SIGN_IN_IP_MAX,
  SIGN_IN_IP_WINDOW_MS
} from '@api/constants/rate-limiter';
import { RedisRateLimiter, type RateLimitResult } from '@api/utils/redis/limiter';
import { extractClientIp } from '@api/utils/redis/key-generators';
import { env } from '@cio/core/config/env';
import { logRedisUnavailableOnce, redis } from '@cio/core/utils/redis/redis';

export function signInEmailRateLimitKey(email: string): string {
  return `sign-in:email:${email.trim().toLowerCase()}`;
}

export function signInIpRateLimitKey(ip: string): string {
  return `sign-in:ip:${ip}`;
}

/**
 * Better Auth's built-in sign-in limiter is keyed by IP and path, so one shared
 * network locks out every account after a few attempts. This limiter counts each
 * email on its own and only applies a generous ceiling per IP.
 */
export async function enforceEmailSignInRateLimit(c: Context, request: Request): Promise<Response | null> {
  if (env.NODE_ENV !== 'production') return null;

  try {
    const email = await readSignInEmail(request);
    if (email) {
      const emailLimiter = new RedisRateLimiter(redis, SIGN_IN_EMAIL_WINDOW_MS, SIGN_IN_EMAIL_MAX);
      const emailResult = await emailLimiter.isAllowed(signInEmailRateLimitKey(email));
      if (!emailResult.allowed) return tooManySignIns(c, emailResult);
    }

    const ipLimiter = new RedisRateLimiter(redis, SIGN_IN_IP_WINDOW_MS, SIGN_IN_IP_MAX);
    const ipResult = await ipLimiter.isAllowed(signInIpRateLimitKey(extractClientIp(c)));
    if (!ipResult.allowed) return tooManySignIns(c, ipResult);
  } catch (error) {
    logRedisUnavailableOnce('Redis sign-in limiter unavailable, allowing sign-in', error);
  }

  return null;
}

async function readSignInEmail(request: Request): Promise<string | null> {
  try {
    const body = (await request.clone().json()) as { email?: unknown };
    if (typeof body.email !== 'string') return null;

    const email = body.email.trim().toLowerCase();
    return email || null;
  } catch {
    return null;
  }
}

function tooManySignIns(c: Context, result: RateLimitResult): Response {
  const retryAfter = Math.max(1, Math.ceil((result.resetTime - Date.now()) / 1000));
  c.header('Retry-After', retryAfter.toString());

  return c.json(
    {
      error: 'Too Many Requests',
      message: 'Too many sign-in attempts. Please try again later.',
      retryAfter
    },
    429
  );
}
