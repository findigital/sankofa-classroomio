import { describe, expect, it } from 'vitest';

import { formatLessonDuration, takeCourseOutlinePreviews } from '@db/queries/course/course-outline-preview';

describe('takeCourseOutlinePreviews', () => {
  it('keeps the first titled lessons and real durations', () => {
    const previews = takeCourseOutlinePreviews([
      { courseId: 'course-1', title: 'Welcome', sessionDurationMinutes: 42 },
      { courseId: 'course-1', title: '   ', sessionDurationMinutes: 10 },
      { courseId: 'course-1', title: 'Practice', sessionDurationMinutes: 72 },
      { courseId: 'course-1', title: 'Review', sessionDurationMinutes: null },
      { courseId: 'course-1', title: 'Extra', sessionDurationMinutes: 15 },
      { courseId: 'course-1', title: 'Skipped', sessionDurationMinutes: 9 },
      { courseId: 'course-2', title: 'Capstone', sessionDurationMinutes: 120 }
    ]);

    expect(previews['course-1']).toEqual([
      { label: 'Welcome', duration: '42 min' },
      { label: 'Practice', duration: '1h 12m' },
      { label: 'Review' },
      { label: 'Extra', duration: '15 min' }
    ]);
    expect(previews['course-2']).toEqual([{ label: 'Capstone', duration: '2h' }]);
  });
});

describe('formatLessonDuration', () => {
  it('omits missing or empty durations', () => {
    expect(formatLessonDuration(0)).toBeUndefined();
    expect(formatLessonDuration(-5)).toBeUndefined();
  });
});
