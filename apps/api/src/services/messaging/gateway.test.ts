import { describe, expect, it, vi } from 'vitest';
import type { StreamChat } from 'stream-chat';

import { StreamServerGateway } from './gateway';

const PAGE_SIZE = 100;

function streamMessage(index: number) {
  const id = `m${String(index).padStart(4, '0')}`;

  return {
    id,
    text: `hello ${index}`,
    user: { id: 'user-1', name: 'Ada' },
    created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString()
  };
}

function page(start: number, count: number) {
  return Array.from({ length: count }, (_, offset) => streamMessage(start + offset)).reverse();
}

describe('StreamServerGateway.readMessages', () => {
  it('loads every page with channel state and returns messages oldest first', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ messages: page(100, PAGE_SIZE) })
      .mockResolvedValueOnce({ messages: page(0, 40) });
    const client = {
      channel: () => ({ query })
    } as unknown as StreamChat;
    const gateway = new StreamServerGateway(client);
    const messages = await gateway.readMessages('cohort_discussion', 'dis123');

    expect(query).toHaveBeenCalledTimes(2);

    for (const [options] of query.mock.calls) {
      expect(options.state).toBe(true);
      expect(options.watch).toBe(false);
    }

    expect(query.mock.calls[0]?.[0].messages).toEqual({ limit: PAGE_SIZE });
    expect(query.mock.calls[1]?.[0].messages).toEqual({ limit: PAGE_SIZE, id_lt: 'm0100' });
    expect(messages).toHaveLength(140);
    expect(messages[0]?.id).toBe('m0000');
    expect(messages.at(-1)?.id).toBe('m0199');
  });
});
