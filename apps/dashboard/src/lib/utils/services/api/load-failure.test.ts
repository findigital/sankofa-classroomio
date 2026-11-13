import { describe, expect, it } from 'vitest';

import { classifyCourseLoadFailure } from './load-failure';

describe('classifyCourseLoadFailure', () => {
  it('turns a rate limit or upstream failure into a retryable course state', () => {
    expect(classifyCourseLoadFailure(429)).toBe('rate_limited');
    expect(classifyCourseLoadFailure(502)).toBe('unavailable');
    expect(classifyCourseLoadFailure(0)).toBe('unavailable');
  });

  it('leaves missing courses and other client errors to the existing page result', () => {
    expect(classifyCourseLoadFailure(404)).toBeNull();
    expect(classifyCourseLoadFailure(403)).toBeNull();
    expect(classifyCourseLoadFailure(200)).toBeNull();
  });
});
