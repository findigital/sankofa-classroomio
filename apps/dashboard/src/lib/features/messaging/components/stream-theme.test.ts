import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const directory = dirname(fileURLToPath(import.meta.url));
const theme = readFileSync(join(directory, 'stream-theme.css'), 'utf8');
const layout = readFileSync(join(directory, 'inbox.css'), 'utf8');

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
    expect(theme).toContain('.str-chat__message-input .str-chat__send-button:disabled');
    expect(theme).toContain('background-color: var(--primary)');
    expect(theme).toContain('fill: var(--primary-foreground)');
    expect(theme).toContain('border-radius: calc(var(--radius) - 2px)');
    expect(theme).toContain('.str-chat__send-button:hover:not(:disabled)');
    expect(theme).toContain('color-mix(in oklch, var(--primary) 90%, transparent)');
    expect(theme).toContain('opacity: 0.5');
    expect(theme).not.toMatch(/#005fff|#1d4ee2|rgba\(0,\s*95,\s*255|rgba\(51,\s*126,\s*255/i);
  });

  it('makes the mobile channel list a full-width card', () => {
    const mobile = layout.slice(layout.indexOf('@media (max-width: 767px)'));

    expect(mobile).toContain('background: var(--card)');
    expect(mobile).toContain('--str-chat__channel-list-background-color: var(--card)');
    expect(mobile).toContain('width: 100%');
    expect(mobile).toContain('border-radius: 0');
  });
});
