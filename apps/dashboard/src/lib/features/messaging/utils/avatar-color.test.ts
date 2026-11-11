import { describe, expect, it } from 'vitest';

import {
  channelColorKey,
  courseColorIndex,
  courseColorVariable,
  senderColorIndex,
  senderColorVariable,
  COURSE_COLOR_COUNT,
  SENDER_COLOR_COUNT
} from './avatar-color';

describe('sender color hashing', () => {
  it('keeps one person on one of eleven colors everywhere', () => {
    const ada = senderColorIndex('ada-fellow');

    expect(SENDER_COLOR_COUNT).toBe(11);
    expect(senderColorIndex('ada-fellow')).toBe(ada);
    expect(ada).toBeGreaterThanOrEqual(0);
    expect(ada).toBeLessThan(SENDER_COLOR_COUNT);
    expect(senderColorVariable('ada-fellow')).toBe(`var(--messaging-sender-${ada})`);
    expect(senderColorVariable('ada-fellow')).toBe(senderColorVariable('ada-fellow'));
  });

  it('does not move a person when other members are present', () => {
    const alone = senderColorVariable('taylor');
    const withStaff = senderColorVariable('taylor');

    expect(withStaff).toBe(alone);
    expect(senderColorIndex('taylor')).toBe(senderColorIndex('taylor'));
  });

  it('spreads people across more than one color', () => {
    const colors = new Set(
      ['ada', 'bao', 'cam', 'dee', 'eli', 'fay', 'gio', 'hal', 'ivy', 'jun', 'kai', 'lee'].map((id) =>
        senderColorIndex(id)
      )
    );

    expect(colors.size).toBeGreaterThan(4);
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
    expect(senderColorVariable(direct)).toBe(senderColorVariable('ada-fellow'));
    expect(discussion).toBe('cohort-react');
    expect(announcement).toBe(discussion);
    expect(courseColorVariable(discussion)).toBe(courseColorVariable(announcement));
    expect(courseColorVariable(discussion)).toMatch(/^var\(--messaging-course-\d+\)$/);
    expect(senderColorVariable('taylor')).toMatch(/^var\(--messaging-sender-\d+\)$/);
    expect(COURSE_COLOR_COUNT).toBe(8);
    expect(courseColorIndex('cohort-react')).toBeGreaterThanOrEqual(0);
    expect(courseColorIndex('cohort-react')).toBeLessThan(COURSE_COLOR_COUNT);
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
    expect(senderColorVariable(key)).toBe(senderColorVariable('taylor'));
  });
});
