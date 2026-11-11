import { describe, expect, it } from 'vitest';

import { filterTagGroupsForCatalog, resolveCatalogPresentation } from '../src/functions/catalog-filters';

const groups = [
  { id: 'quarter', name: 'Quarter' },
  { id: 'track', name: 'Track' },
  { id: 'format', name: 'Format' }
];

describe('resolveCatalogPresentation', () => {
  it('hides prices and shows course types when the org has not chosen', () => {
    expect(resolveCatalogPresentation(undefined)).toEqual({
      hideCoursePricing: true,
      showCourseTypeFilter: true,
      filterTagGroupIds: null
    });
    expect(resolveCatalogPresentation({})).toEqual({
      hideCoursePricing: true,
      showCourseTypeFilter: true,
      filterTagGroupIds: null
    });
  });

  it('shows prices only when the org turns hiding off', () => {
    expect(resolveCatalogPresentation({ hideCoursePricing: false }).hideCoursePricing).toBe(false);
    expect(resolveCatalogPresentation({ hideCoursePricing: true }).hideCoursePricing).toBe(true);
  });

  it('hides the course type filter only when the org turns it off', () => {
    expect(resolveCatalogPresentation({ showCourseTypeFilter: true }).showCourseTypeFilter).toBe(true);
    expect(resolveCatalogPresentation({ showCourseTypeFilter: false }).showCourseTypeFilter).toBe(false);
  });

  it('treats a stored id list as the only tag groups that filter', () => {
    expect(resolveCatalogPresentation({ catalogFilterTagGroupIds: ['quarter'] }).filterTagGroupIds).toEqual([
      'quarter'
    ]);
    expect(resolveCatalogPresentation({ catalogFilterTagGroupIds: [] }).filterTagGroupIds).toEqual([]);
    expect(resolveCatalogPresentation({ catalogFilterTagGroupIds: null }).filterTagGroupIds).toBeNull();
  });
});

describe('filterTagGroupsForCatalog', () => {
  it('keeps every group when the org has not chosen', () => {
    expect(filterTagGroupsForCatalog(groups, null)).toEqual(groups);
  });

  it('keeps only the groups the org selected', () => {
    expect(filterTagGroupsForCatalog(groups, ['track', 'missing'])).toEqual([{ id: 'track', name: 'Track' }]);
  });

  it('returns no groups when the org selected none', () => {
    expect(filterTagGroupsForCatalog(groups, [])).toEqual([]);
  });
});
