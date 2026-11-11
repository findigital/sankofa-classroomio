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

const ADULT_ID = '11111111-1111-4111-8111-111111111111';
const MINOR_ID = '22222222-2222-4222-8222-222222222222';
const FORMER_STAFF_ID = '44444444-4444-4444-8444-444444444444';
const NEXT_STAFF_ID = '55555555-5555-4555-8555-555555555555';

function member(id: string) {
  return { user_id: id };
}

function channelClient(members: string[], memberCount: number) {
  const queryMembers = vi.fn().mockResolvedValue({ members: members.map(member) });
  const addMembers = vi.fn().mockResolvedValue({});
  const removeMembers = vi.fn().mockResolvedValue({});
  const query = vi.fn().mockResolvedValue({ channel: { member_count: memberCount }, messages: [] });
  const create = vi.fn().mockRejectedValue({ code: 4, message: 'already exists' });
  const updatePartial = vi.fn().mockResolvedValue({});
  const client = {
    channel: vi.fn((_type: string, id: string) => ({
      id,
      type: _type,
      data: {},
      create,
      query,
      queryMembers,
      addMembers,
      removeMembers,
      updatePartial
    }))
  } as unknown as StreamChat;

  return { client, queryMembers, addMembers, removeMembers, query };
}

describe('StreamServerGateway.ensureChannel', () => {
  it('replaces former safeguarding staff and returns Stream member_count', async () => {
    const stream = channelClient([ADULT_ID, MINOR_ID, FORMER_STAFF_ID], 4);
    const gateway = new StreamServerGateway(stream.client);

    const summary = await gateway.ensureChannel({
      channelType: 'mentor_dm',
      channelId: 'mdm123',
      organizationId: 'org',
      name: 'mentor_dm',
      purpose: 'mentor_dm',
      createdById: ADULT_ID,
      memberIds: [ADULT_ID, MINOR_ID, NEXT_STAFF_ID],
      protectedMemberIds: [ADULT_ID, MINOR_ID]
    });

    const removed = stream.removeMembers.mock.calls.flatMap((call) => call[0] as string[]);

    expect(stream.addMembers).toHaveBeenCalledWith([NEXT_STAFF_ID]);
    expect(removed).toEqual([FORMER_STAFF_ID]);
    expect(summary.memberCount).toBe(4);
  });

  it('does not remove the two direct-message participants', async () => {
    const stream = channelClient([ADULT_ID, MINOR_ID, FORMER_STAFF_ID], 2);
    const gateway = new StreamServerGateway(stream.client);

    const summary = await gateway.ensureChannel({
      channelType: 'fellow_dm',
      channelId: 'fdm123',
      organizationId: 'org',
      name: 'fellow_dm',
      purpose: 'fellow_dm',
      createdById: ADULT_ID,
      memberIds: [NEXT_STAFF_ID],
      protectedMemberIds: [ADULT_ID, MINOR_ID]
    });

    expect(stream.addMembers).toHaveBeenCalledWith([NEXT_STAFF_ID]);
    expect(stream.removeMembers).toHaveBeenCalledTimes(1);
    expect(stream.removeMembers).toHaveBeenCalledWith([FORMER_STAFF_ID]);
    expect(summary.memberCount).toBe(2);
  });

  it('adds and removes cohort members to match the roster', async () => {
    const stream = channelClient(['kept', 'left'], 2);
    const gateway = new StreamServerGateway(stream.client);

    const summary = await gateway.ensureChannel({
      channelType: 'cohort_discussion',
      channelId: 'dis123',
      organizationId: 'org',
      name: 'Cohort',
      purpose: 'discussion',
      cohortId: 'group',
      createdById: 'kept',
      memberIds: ['kept', 'joined']
    });

    expect(stream.addMembers).toHaveBeenCalledWith(['joined']);
    expect(stream.removeMembers).toHaveBeenCalledWith(['left']);
    expect(summary.memberCount).toBe(2);
  });

  it('pages the member query and removes extras in batches of 100', async () => {
    const current = Array.from({ length: 102 }, (_, index) => `m${String(index).padStart(3, '0')}`);
    const stream = channelClient([], 1);
    stream.queryMembers
      .mockResolvedValueOnce({ members: current.slice(0, 100).map(member) })
      .mockResolvedValueOnce({ members: current.slice(100).map(member) });
    const gateway = new StreamServerGateway(stream.client);

    await gateway.ensureChannel({
      channelType: 'cohort_announcement',
      channelId: 'ann123',
      organizationId: 'org',
      name: 'Cohort',
      purpose: 'announcement',
      createdById: 'm000',
      memberIds: ['m000']
    });

    expect(stream.queryMembers).toHaveBeenNthCalledWith(2, {}, { user_id: 1 }, { limit: 100, user_id_gt: 'm099' });
    expect(stream.removeMembers).toHaveBeenNthCalledWith(1, current.slice(1, 101));
    expect(stream.removeMembers).toHaveBeenNthCalledWith(2, ['m101']);
    expect(stream.addMembers).not.toHaveBeenCalled();
  });
});
