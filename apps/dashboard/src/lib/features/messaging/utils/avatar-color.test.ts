import { describe, expect, it } from 'vitest';

import {
  channelColorKey,
  distinctSenderIndexes,
  senderColorIndex,
  senderColorVariable,
  senderIndexForMember,
  SENDER_HUE_COUNT
} from './avatar-color';

describe('sender color hashing', () => {
  it('keeps one person on one of sixteen hues', () => {
    const ada = senderColorIndex('ada-fellow');

    expect(SENDER_HUE_COUNT).toBe(16);
    expect(senderColorIndex('ada-fellow')).toBe(ada);
    expect(ada).toBeGreaterThanOrEqual(0);
    expect(ada).toBeLessThan(SENDER_HUE_COUNT);
    expect(senderColorVariable('ada-fellow')).toBe(`var(--messaging-sender-${ada})`);
  });

  it('separates different people across the palette', () => {
    const hues = new Set(
      ['ada', 'bao', 'cam', 'dee', 'eli', 'fay', 'gio', 'hal', 'ivy', 'jun', 'kai', 'lee', 'Q1', 'Q2'].map((id) =>
        senderColorIndex(id)
      )
    );

    expect(hues.size).toBeGreaterThan(4);
  });

  it('gives two members who hash to one hue different colors, in id order', () => {
    const first = 'same-hue-a';
    let second = 'same-hue-b';

    for (let attempt = 0; attempt < 200 && senderColorIndex(second) !== senderColorIndex(first); attempt += 1) {
      second = `same-hue-${attempt}`;
    }

    expect(senderColorIndex(second)).toBe(senderColorIndex(first));

    const assigned = distinctSenderIndexes([second, first].sort().reverse());
    const ordered = [first, second].sort();

    expect(assigned.get(ordered[0]!)).toBe(senderColorIndex(ordered[0]!));
    expect(assigned.get(ordered[1]!)).not.toBe(assigned.get(ordered[0]!));
    expect(new Set(assigned.values()).size).toBe(2);
  });

  it('keeps the named people in one channel on different hues', () => {
    const members = ['Q1', 'Q2', 'Welcome', 'Toolkit', 'Amara', 'Taylor'];
    const assigned = distinctSenderIndexes(members);

    expect(new Set(assigned.values()).size).toBe(members.length);
    expect(assigned.get('Q1')).not.toBe(assigned.get('Q2'));
    expect(assigned.get('Welcome')).not.toBe(assigned.get('Toolkit'));
    expect(assigned.get('Amara')).not.toBe(assigned.get('Taylor'));
    expect(senderIndexForMember('Taylor', members)).toBe(assigned.get('Taylor'));
  });

  it('colors a direct channel from the other person and both course channels from the course', () => {
    const direct = channelColorKey({
      purpose: 'mentor_dm',
      cohortId: null,
      members: [
        { id: 'me', name: 'Ada Fellow' },
        { id: 'ada-fellow', name: 'Bea Fellow' }
      ],
      selfId: 'me',
      displayName: 'Bea Fellow',
      fallback: 'mentor_dm:mdm'
    });
    const discussion = channelColorKey({
      purpose: 'discussion',
      cohortId: 'cohort-react',
      members: [
        { id: 'me', name: 'Ada Fellow' },
        { id: 'ada-fellow', name: 'Bea Fellow' }
      ],
      selfId: 'me',
      displayName: 'React Discussion',
      fallback: 'cohort_discussion:dis'
    });
    const announcement = channelColorKey({
      purpose: 'announcement',
      cohortId: 'cohort-react',
      fallback: 'cohort_announcement:ann'
    });

    expect(direct).toBe('ada-fellow');
    expect(discussion).toBe('cohort-react');
    expect(announcement).toBe(discussion);
    expect(senderColorVariable(discussion)).toBe(senderColorVariable(announcement));
  });

  it('skips safeguarding staff and uses the named mentor or fellow', () => {
    const key = channelColorKey({
      purpose: 'mentor_dm',
      members: [
        { id: 'staff-amara', name: 'Amara Admin' },
        { id: 'me', name: 'Ada Fellow' },
        { id: 'taylor', name: 'Taylor Mentor' }
      ],
      selfId: 'me',
      displayName: 'Taylor Mentor',
      fallback: 'mentor_dm:mdm'
    });

    expect(key).toBe('taylor');
    expect(senderIndexForMember(key, ['staff-amara', 'me', 'taylor'])).toBe(
      distinctSenderIndexes(['staff-amara', 'me', 'taylor']).get('taylor')
    );
  });
});
