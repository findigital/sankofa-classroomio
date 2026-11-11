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

    for (let hue = 0; hue < 12; hue += 1) {
      expect(theme).toContain(`--messaging-sender-${hue}:`);
      expect(theme).toContain(`--messaging-sender-${hue}-label:`);
    }

    expect(theme).toContain('--messaging-sender-0: #0e7490;');
    expect(theme).toContain('--messaging-sender-9: #166534;');
    expect(theme).toContain('--messaging-sender-11: #7c2d12;');
    expect(theme).not.toContain('oklch(from var(--primary)');
    expect(theme).toContain('.dark .messaging-inbox');
    expect(theme).toContain('--messaging-sender-0-label: #67e8f9;');
    expect(theme).toContain('--messaging-received-bubble: oklch(0.95 0.01 250);');
    expect(theme).toContain('--messaging-received-bubble: oklch(0.32 0.015 250);');
    expect(theme).not.toContain('color-mix(in oklch, oklch(0.52 0.04 250)');
    expect(theme).toContain('.str-chat__message--me .str-chat__message-bubble');
    expect(theme).toContain('background-color: var(--primary)');
    expect(theme).toContain('width: 20px');
    expect(theme).toContain('border-bottom-left-radius: 16px 14px');
    expect(theme).toContain('.str-chat__li--bottom .str-chat__message--other .str-chat__message-bubble::after');
    expect(theme).toContain('.str-chat__li--single .str-chat__message--me .str-chat__message-bubble::before');
    expect(theme).toContain('.str-chat__date-separator-line');
    expect(layout).toContain('min-width: 25rem');
    expect(layout).toContain('width: 20rem');
    expect(layout).toContain('width: 18.75rem');
    expect(layout).toContain('width: 16.25rem');
    expect(layout).toContain('@container messaging-channel (max-width: 43.75rem)');
    expect(layout).toContain('.messaging-inbox__mobile-thread');
    expect(layout).toContain('grid-column: 2');
    expect(layout).toContain('text-overflow: ellipsis');
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
    expect(mobile).toContain('.messaging-inbox__mobile-thread');
    expect(mobile).toContain('text-overflow: ellipsis');
  });
});
