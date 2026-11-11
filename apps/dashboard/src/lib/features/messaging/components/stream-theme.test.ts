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

    for (let hue = 0; hue < 8; hue += 1) {
      expect(theme).toContain(`--messaging-sender-${hue}:`);
      expect(theme).toContain(`--messaging-sender-${hue}-label:`);
    }

    expect(theme).toContain('oklch(from var(--primary) 0.42 c h)');
    expect(theme).toContain('oklch(from var(--primary) 0.38 c h)');
    expect(theme).toContain('.dark .messaging-inbox');
    expect(theme).toContain('oklch(from var(--primary) 0.78 c h)');
    expect(theme).toContain('color-mix(in oklch, var(--messaging-sender-fill, transparent) 8%, var(--muted))');
    expect(theme).toContain('color-mix(in oklch, var(--messaging-sender-fill, transparent) 12%, var(--secondary))');
    expect(theme).toContain('.str-chat__message--me .str-chat__message-bubble');
    expect(theme).toContain('background-color: var(--primary)');
    expect(theme).toContain('border-color: transparent transparent transparent var(--primary)');
    expect(theme).toContain('.str-chat__li--bottom .str-chat__message--other .str-chat__message-bubble::after');
    expect(theme).toContain('.str-chat__li--single .str-chat__message--me .str-chat__message-bubble::after');
    expect(theme).toContain('margin-block-end: 0.125rem');
    expect(theme).toContain("data-channel-kind='direct'");
    expect(theme).toContain('.str-chat__channel-preview-messenger--unread .str-chat__channel-preview-messenger--name');
    expect(theme).toContain('font-weight: 700');
    expect(theme).toContain('--str-chat__date-separator-color: var(--muted-foreground)');
  });

  it('makes the mobile channel list a full-width card', () => {
    const mobile = layout.slice(layout.indexOf('@media (max-width: 767px)'));

    expect(mobile).toContain('background: var(--card)');
    expect(mobile).toContain('--str-chat__channel-list-background-color: var(--card)');
    expect(mobile).toContain('width: 100%');
    expect(mobile).toContain('border-radius: 0');
  });
});
