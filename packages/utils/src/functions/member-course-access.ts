export type MemberAutoEnrollSettings = {
  membersOnlyCatalog?: boolean | null;
  autoEnrollMembers?: boolean | null;
};

/**
 * Students are enrolled in every published course when this is on.
 * An explicit `autoEnrollMembers` wins. Otherwise it follows the members-only catalog.
 */
export function isAutoEnrollMembersEnabled(settings: MemberAutoEnrollSettings | null | undefined): boolean {
  if (typeof settings?.autoEnrollMembers === 'boolean') return settings.autoEnrollMembers;

  return settings?.membersOnlyCatalog === true;
}

export type MemberCourseCta = { mode: 'enroll' } | { mode: 'open'; started: boolean; href: string };

/**
 * Signed-in org members open the course instead of enrolling when the catalog is members-only
 * or member auto-enroll is on. Everyone else keeps the enroll action.
 */
export function resolveMemberCourseCta(input: {
  membersOnlyCatalog: boolean;
  autoEnrollMembers: boolean;
  isOrgMember: boolean;
  started: boolean;
  courseId: string;
}): MemberCourseCta {
  const openCourse = input.isOrgMember && (input.membersOnlyCatalog || input.autoEnrollMembers);

  if (!openCourse) return { mode: 'enroll' };

  const href = input.started ? `/courses/${input.courseId}/lessons?next=true` : `/courses/${input.courseId}/lessons`;

  return { mode: 'open', started: input.started, href };
}
