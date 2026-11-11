import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

import { formatSubmittedDate } from './submissions-utils';

describe('formatSubmittedDate', () => {
  it('matches a local date format and does not force UTC', () => {
    const iso = '2026-11-12T00:39:00.000Z';
    const parsed = new Date(iso);
    const local = new Intl.DateTimeFormat('en-US', {
      dateStyle: 'full',
      timeStyle: 'medium'
    }).format(parsed);
    const utc = new Intl.DateTimeFormat('en-US', {
      dateStyle: 'full',
      timeStyle: 'medium',
      timeZone: 'UTC'
    }).format(parsed);

    expect(formatSubmittedDate(iso)).toBe(local);
    if (local !== utc) {
      expect(formatSubmittedDate(iso)).not.toBe(utc);
    }
  });

  it('formats 00:39 UTC as 7:39 PM the previous evening in America/New_York', () => {
    const result = spawnSync(
      process.execPath,
      [
        '--experimental-strip-types',
        '--input-type=module',
        '-e',
        `
          import { formatSubmittedDate } from ${JSON.stringify(new URL('./submissions-utils.ts', import.meta.url).pathname)};
          const formatted = formatSubmittedDate('2026-11-12T00:39:00.000Z');
          if (!formatted.includes('7:39:00 PM') || !formatted.includes('Wednesday')) {
            console.error(formatted);
            process.exit(1);
          }
        `
      ],
      { encoding: 'utf8', env: { ...process.env, TZ: 'America/New_York' } }
    );

    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  it('returns an empty string for a missing or invalid timestamp', () => {
    expect(formatSubmittedDate(null)).toBe('');
    expect(formatSubmittedDate(undefined)).toBe('');
    expect(formatSubmittedDate('not-a-date')).toBe('');
  });
});
