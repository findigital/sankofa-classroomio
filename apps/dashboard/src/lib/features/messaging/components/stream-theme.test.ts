import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const theme = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'stream-theme.css'), 'utf8');

describe('Stream inbox theme', () => {
  it('derives Stream colors from the dashboard tokens for light and dark', () => {
    expect(theme).toContain('.str-chat__theme-light');
    expect(theme).toContain('.str-chat__theme-dark');
    expect(theme).toContain('.dark .messaging-inbox');

    for (const token of [
      'var(--background)',
      'var(--card)',
      'var(--sidebar)',
      'var(--sidebar-foreground)',
      'var(--sidebar-accent)',
      'var(--sidebar-border)',
      'var(--border)',
      'var(--input)',
      'var(--muted)',
      'var(--muted-foreground)',
      'var(--foreground)',
      'var(--primary)',
      'var(--primary-foreground)',
      'var(--radius)',
      'var(--font-sans)',
      'var(--text-sm, 0.875rem)'
    ]) {
      expect(theme).toContain(token);
    }

    expect(theme).toContain('--str-chat__channel-list-background-color: var(--sidebar)');
    expect(theme).toContain('--str-chat__message-list-background-color: var(--card)');
    expect(theme).toContain('--str-chat__own-message-bubble-background-color: var(--primary)');
    expect(theme).toContain('--str-chat__own-message-bubble-color: var(--primary-foreground)');
    expect(theme).toContain('--str-chat__message-send-background-color: var(--primary)');
    expect(theme).toContain('--str-chat__message-send-color: var(--primary-foreground)');
    expect(theme).not.toMatch(/#005fff|#1d4ee2|rgba\(0,\s*95,\s*255|rgba\(51,\s*126,\s*255/i);
  });
});
