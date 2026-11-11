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

vi.mock('$app/environment', () => ({ browser: true, dev: true, building: false }));

vi.mock('$lib/utils/functions/translations', async () => {
  const { readable } = await import('svelte/store');
  const translate = (key: string) => key;

  return { t: readable(translate) };
});

vi.mock('$features/messaging/api/messaging.svelte', () => ({
  messagingApi: {
    session: {
      apiKey: 'key',
      token: 'token',
      userId: 'me',
      userName: 'Ada Mentor',
      disclosureAccepted: true
    },
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

vi.mock('$features/messaging/components/inbox-view', () => ({
  mountInbox(host: HTMLElement) {
    return {
      render(next: { channels: Array<{ name: string }> }) {
        host.replaceChildren();
        const list = document.createElement('aside');
        list.dataset.testid = 'messaging-channel-list';
        list.textContent = next.channels.map((channel) => channel.name).join('');
        const thread = document.createElement('section');
        thread.dataset.testid = 'messaging-thread';
        host.append(list, thread);
      },
      destroy() {
        host.replaceChildren();
      }
    };
  }
}));

import MessagesPage from './messages.svelte';

describe('Messages page', () => {
  it('renders the inbox body, not only the title', async () => {
    render(MessagesPage);

    expect(screen.getByText('messaging.heading')).toBeTruthy();
    expect(screen.getByText('messaging.notice.body')).toBeTruthy();
    expect(await screen.findByText('Bea Fellow')).toBeTruthy();
    expect(screen.getByTestId('messaging-channel-list')).toBeTruthy();
    expect(screen.getByTestId('messaging-thread')).toBeTruthy();
  });
});
