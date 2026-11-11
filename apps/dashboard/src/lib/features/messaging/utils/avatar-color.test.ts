import { describe, expect, it } from 'vitest';

import { cohortMarkColor } from './avatar-color';

describe('cohort mark color', () => {
  it('keeps one course on one token and separates different courses', () => {
    const react = cohortMarkColor('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    const python = cohortMarkColor('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

    expect(cohortMarkColor('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toBe(react);
    expect(react).toMatch(/^var\(--(chart-[2-5]|sidebar-primary)\)$/);
    expect(python).toMatch(/^var\(--(chart-[2-5]|sidebar-primary)\)$/);
    expect(python).not.toBe(react);
  });
});
