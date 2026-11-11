import { describe, expect, it } from 'vitest';

import { channelColorKey, senderColorIndex, senderColorVariable, SENDER_HUE_COUNT } from './avatar-color';

describe('sender color hashing', () => {
  it('keeps one person on one of eight hues', () => {
    const ada = senderColorIndex('ada-fellow');

    expect(SENDER_HUE_COUNT).toBe(8);
    expect(senderColorIndex('ada-fellow')).toBe(ada);
    expect(ada).toBeGreaterThanOrEqual(0);
    expect(ada).toBeLessThan(SENDER_HUE_COUNT);
    expect(senderColorVariable('ada-fellow')).toBe(`var(--messaging-sender-${ada})`);
  });

  it('separates different people across the palette', () => {
    const hues = new Set(
      ['ada', 'bao', 'cam', 'dee', 'eli', 'fay', 'gio', 'hal', 'ivy', 'jun', 'kai', 'lee'].map((id) =>
        senderColorIndex(id)
      )
    );

    expect(hues.size).toBeGreaterThan(1);
  });

  it('colors a direct channel from the other person and both course channels from the course', () => {
    const direct = channelColorKey({
      purpose: 'mentor_dm',
      cohortId: null,
      memberIds: ['me', 'ada-fellow'],
      selfId: 'me',
      fallback: 'mentor_dm:mdm'
    });
    const discussion = channelColorKey({
      purpose: 'discussion',
      cohortId: 'cohort-react',
      memberIds: ['me', 'ada-fellow'],
      selfId: 'me',
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
});
