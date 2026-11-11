import { ROLE } from '../constants';

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

export type PublicCourseInstructorCandidate = {
  name: string;
  avatarUrl?: string | null;
  courseRoleId: number;
  orgRoleId?: number | null;
};

function namesMatch(left: string, right: string): boolean {
  return left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0;
}

/**
 * Course tutors shown on the public course page.
 * Organization admins are omitted unless the landing-page instructor name is their full name.
 */
export function selectPublicCourseInstructors(
  candidates: PublicCourseInstructorCandidate[],
  options: { explicitInstructorName?: string | null; orgName?: string | null }
): Array<{ name: string; avatarUrl: string | null }> {
  const explicitName = options.explicitInstructorName?.trim() ?? '';
  const orgName = options.orgName?.trim() ?? '';
  const namedInstructor = explicitName.length > 0 && !namesMatch(explicitName, orgName);
  const tutors: Array<{ name: string; avatarUrl: string | null }> = [];
  const chosenAdmins: Array<{ name: string; avatarUrl: string | null }> = [];

  for (const candidate of candidates) {
    const name = candidate.name.trim();
    if (!name) continue;

    const courseRoleId = Number(candidate.courseRoleId);
    const orgRoleId = candidate.orgRoleId == null ? null : Number(candidate.orgRoleId);
    const person = { name, avatarUrl: candidate.avatarUrl ?? null };
    const explicitlyChosen = namedInstructor && namesMatch(name, explicitName);

    if (courseRoleId === ROLE.TUTOR && orgRoleId !== ROLE.ADMIN) {
      tutors.push(person);
      continue;
    }

    if (explicitlyChosen && (orgRoleId === ROLE.ADMIN || courseRoleId === ROLE.ADMIN || courseRoleId === ROLE.TUTOR)) {
      chosenAdmins.push(person);
    }
  }

  return [...tutors, ...chosenAdmins];
}
