// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte/svelte5';

vi.mock('$env/dynamic/public', () => ({
  env: { PUBLIC_MESSAGING_ENABLED: 'true' }
}));

vi.mock('$env/static/public', () => ({
  PUBLIC_IS_SELFHOSTED: 'false',
  PUBLIC_SERVER_URL: 'http://localhost:3002'
}));

vi.mock('$app/environment', () => ({ browser: false, dev: true, building: false }));

vi.mock('$lib/utils/functions/translations', async () => {
  const { readable } = await import('svelte/store');
  const translate = (key: string) => key;

  return { t: readable(translate) };
});

vi.mock('$features/messaging/api/messaging.svelte', () => ({
  messagingApi: {
    session: { disclosureAccepted: true, userId: 'me' },
    channels: [
      {
        channelType: 'mentor_dm',
        channelId: 'mdm',
        name: 'Bea Fellow',
        purpose: 'mentor_dm',
        cohortId: null,
        memberCount: 2,
        lastMessageAt: null
      }
    ],
    directory: [],
    messages: null,
    adminChannels: null,
    activity: null,
    keywords: [],
    cohorts: [],
    safeguarding: null,
    loadSession: vi.fn().mockResolvedValue(undefined),
    loadChannels: vi.fn().mockResolvedValue(undefined),
    loadDirectory: vi.fn().mockResolvedValue(undefined)
  }
}));

vi.mock('$features/messaging/api/messaging-presence.svelte', () => ({
  messagingPresence: {
    connect: vi.fn().mockResolvedValue(undefined),
    onMessage: vi.fn().mockReturnValue(() => undefined)
  }
}));

import MessagesPage from './messages.svelte';

describe('Messages page', () => {
  it('renders the inbox body, not only the title', () => {
    render(MessagesPage);

    expect(screen.getByText('messaging.heading')).toBeTruthy();
    expect(screen.getByText('messaging.notice.body')).toBeTruthy();
    expect(screen.getByText('Bea Fellow')).toBeTruthy();
  });
});
