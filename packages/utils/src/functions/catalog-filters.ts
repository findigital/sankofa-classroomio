export type CatalogPresentationSettings = {
  hideCoursePricing?: boolean | null;
  showCourseTypeFilter?: boolean | null;
  catalogFilterTagGroupIds?: string[] | null;
};

export type CatalogPresentation = {
  hideCoursePricing: boolean;
  showCourseTypeFilter: boolean;
  /** `null` shows every tag group. An array shows only those groups. */
  filterTagGroupIds: string[] | null;
};

/**
 * Resolves catalog price and filter settings.
 * A missing `hideCoursePricing` hides prices. Course type filters stay on until turned off.
 * A missing tag-group list shows every group.
 */
export function resolveCatalogPresentation(
  settings: CatalogPresentationSettings | null | undefined
): CatalogPresentation {
  const filterTagGroupIds = settings?.catalogFilterTagGroupIds;

  return {
    hideCoursePricing: settings?.hideCoursePricing !== false,
    showCourseTypeFilter: settings?.showCourseTypeFilter !== false,
    filterTagGroupIds: Array.isArray(filterTagGroupIds) ? filterTagGroupIds : null
  };
}

export function filterTagGroupsForCatalog<T extends { id: string }>(
  groups: T[],
  filterTagGroupIds: string[] | null
): T[] {
  if (!filterTagGroupIds) return groups;

  const allowedIds = new Set(filterTagGroupIds);

  return groups.filter((group) => allowedIds.has(group.id));
}
