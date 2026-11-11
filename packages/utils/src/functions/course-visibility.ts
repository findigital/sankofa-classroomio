export type CourseOpenDecision = 'allow' | 'hidden' | 'sign-in';

export function canListOrgCatalog(membersOnly: boolean, isOrgMember: boolean): boolean {
  return !membersOnly || isOrgMember;
}

/**
 * Decides whether a visitor may open `/course/:slug`.
 * Unpublished courses are staff-only. A members-only org hides published courses from everyone else.
 */
export function evaluateCourseOpen(input: {
  isPublished: boolean;
  membersOnly: boolean;
  isAuthenticated: boolean;
  isOrgMember: boolean;
  isCourseStaff: boolean;
}): CourseOpenDecision {
  if (!input.isPublished) {
    return input.isCourseStaff ? 'allow' : 'hidden';
  }

  if (input.membersOnly && !input.isOrgMember) {
    return input.isAuthenticated ? 'hidden' : 'sign-in';
  }

  return 'allow';
}
