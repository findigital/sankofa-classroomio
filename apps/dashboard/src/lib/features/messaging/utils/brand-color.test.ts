import { describe, expect, it } from 'vitest';

import { brandColor } from './brand-color';

describe('brandColor', () => {
  it('maps theme presets and hex values', () => {
    expect(brandColor(undefined)).toBe('#1d4ee2');
    expect(brandColor('rose')).toBe('#be1241');
    expect(brandColor('#112233')).toBe('#112233');
    expect(brandColor('unknown')).toBe('#1d4ee2');
  });
});
