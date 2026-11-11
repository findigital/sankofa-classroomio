import { ensureComplianceEnrollmentRecordsForProfiles } from '@api/services/course/compliance';
import { getOrganizationById } from '@cio/db/queries/organization';
import {
  listActiveOrgStudentsForAutoEnroll,
  listCourseTutorProfiles,
  listOrganizationIdsForMemberAutoEnroll,
  listPublishedCourseGroupsForAutoEnroll,
  listStartedCourseIdsForProfile,
  removeUnpublishedStudentMembershipsWithoutProgress
} from '@cio/db/queries/course';
import { enrollUsersInCourseGroups } from '@cio/db/queries/group';
import { ROLE } from '@cio/utils/constants';
import {
  isAutoEnrollMembersEnabled,
  resolveMemberCourseCta,
  selectPublicCourseInstructors,
  type MemberAutoEnrollSettings
} from '@cio/utils/functions';

export type ViewerCourseAccess = {
  openCourse: true;
  started: boolean;
  href: string;
};

export type MemberAutoEnrollResult = {
  inserted: number;
  removed: number;
};

/**
 * Adds active organization students to every published course group.
 * Existing memberships are left in place. Unpublished courses are not enrolled.
 * Student memberships on unpublished courses are removed when they have no progress or submissions.
 */
export async function autoEnrollOrgStudents(input: {
  orgId: string;
  profileIds?: string[];
  courseIds?: string[];
}): Promise<MemberAutoEnrollResult> {
  if (input.profileIds && input.profileIds.length === 0) return { inserted: 0, removed: 0 };

  const org = await getOrganizationById(input.orgId);
  if (!org || !isAutoEnrollMembersEnabled(org.settings)) return { inserted: 0, removed: 0 };

  const removed = await removeUnpublishedStudentMembershipsWithoutProgress(input.orgId, input.profileIds);

  if (input.courseIds && input.courseIds.length === 0) return { inserted: 0, removed };

  const courses = (await listPublishedCourseGroupsForAutoEnroll(input.orgId, input.courseIds)).filter(
    (course) => course.isPublished
  );
  const students = await listActiveOrgStudentsForAutoEnroll(input.orgId, input.profileIds);
  if (courses.length === 0 || students.length === 0) return { inserted: 0, removed };

  const inserted = await enrollUsersInCourseGroups(
    courses.map((course) => course.groupId),
    students.map((student) => ({
      profileId: student.profileId,
      email: student.email ?? undefined
    })),
    ROLE.STUDENT
  );

  if (inserted.length === 0) return { inserted: 0, removed };

  const courseIdByGroupId = new Map(courses.map((course) => [course.groupId, course.courseId]));
  const touchedCourseIds = [
    ...new Set(
      inserted.flatMap((member) => {
        const courseId = courseIdByGroupId.get(member.groupId);
        return courseId ? [courseId] : [];
      })
    )
  ];
  const touchedProfileIds = [...new Set(inserted.flatMap((member) => (member.profileId ? [member.profileId] : [])))];

  if (touchedCourseIds.length > 0 && touchedProfileIds.length > 0) {
    try {
      await ensureComplianceEnrollmentRecordsForProfiles(touchedCourseIds, touchedProfileIds);
    } catch (error) {
      console.error('autoEnrollOrgStudents compliance error:', error);
    }
  }

  return { inserted: inserted.length, removed };
}

export async function autoEnrollOrgStudentQuietly(orgId: string, profileId: string): Promise<void> {
  try {
    await autoEnrollOrgStudents({ orgId, profileIds: [profileId] });
  } catch (error) {
    console.error('autoEnrollOrgStudentQuietly error:', error);
  }
}

export async function autoEnrollPublishedCourseQuietly(orgId: string, courseId: string): Promise<void> {
  try {
    await autoEnrollOrgStudents({ orgId, courseIds: [courseId] });
  } catch (error) {
    console.error('autoEnrollPublishedCourseQuietly error:', error);
  }
}

/**
 * Enrolls students of every organization that has member auto-enroll on.
 * Safe to run more than once.
 */
export async function autoEnrollMembersOnBoot(): Promise<void> {
  let orgIds: string[] = [];

  try {
    orgIds = await listOrganizationIdsForMemberAutoEnroll();
  } catch (error) {
    console.error('autoEnrollMembersOnBoot error:', error);
    return;
  }

  for (const orgId of orgIds) {
    try {
      await autoEnrollOrgStudents({ orgId });
    } catch (error) {
      console.error('autoEnrollMembersOnBoot error:', error);
    }
  }
}

export async function viewerMemberCourseAccess(input: {
  orgId: string;
  profileId: string | null;
  orgRoleId: number | undefined;
  courseId: string;
}): Promise<ViewerCourseAccess | null> {
  const isOrgMember = input.orgRoleId != null;
  if (!input.profileId || !isOrgMember) return null;

  const org = await getOrganizationById(input.orgId);
  if (!org) return null;

  const membersOnlyCatalog = org.settings?.membersOnlyCatalog === true;
  const autoEnrollMembers = isAutoEnrollMembersEnabled(org.settings);

  if (input.orgRoleId === ROLE.STUDENT && autoEnrollMembers) {
    await autoEnrollOrgStudentQuietly(input.orgId, input.profileId);
  }

  const startedIds = await listStartedCourseIdsForProfile(input.profileId, [input.courseId]);
  const cta = resolveMemberCourseCta({
    membersOnlyCatalog,
    autoEnrollMembers,
    isOrgMember,
    started: startedIds.includes(input.courseId),
    courseId: input.courseId
  });

  if (cta.mode !== 'open') return null;

  return { openCourse: true, started: cta.started, href: cta.href };
}

export async function publicCourseTutors(
  courseId: string,
  explicit?: { instructorName?: string | null; orgName?: string | null }
) {
  const candidates = await listCourseTutorProfiles(courseId);

  return selectPublicCourseInstructors(candidates, {
    explicitInstructorName: explicit?.instructorName,
    orgName: explicit?.orgName
  });
}

/**
 * Links for catalog cards when this viewer should open courses instead of enrolling.
 * Students are enrolled in every published course before the links are built.
 */
export async function memberCourseLinksForViewer(input: {
  orgId: string;
  settings: MemberAutoEnrollSettings | null | undefined;
  profileId: string | null;
  orgRoleId: number | undefined;
  courseIds: string[];
}): Promise<Map<string, { href: string; started: boolean }>> {
  const isOrgMember = input.orgRoleId != null;
  if (!input.profileId || !isOrgMember || input.courseIds.length === 0) return new Map();

  const autoEnrollMembers = isAutoEnrollMembersEnabled(input.settings);
  const membersOnlyCatalog = input.settings?.membersOnlyCatalog === true;
  if (!membersOnlyCatalog && !autoEnrollMembers) return new Map();

  if (input.orgRoleId === ROLE.STUDENT && autoEnrollMembers) {
    await autoEnrollOrgStudentQuietly(input.orgId, input.profileId);
  }

  const startedIds = new Set(await listStartedCourseIdsForProfile(input.profileId, input.courseIds));
  const links = new Map<string, { href: string; started: boolean }>();

  for (const courseId of input.courseIds) {
    const cta = resolveMemberCourseCta({
      membersOnlyCatalog,
      autoEnrollMembers,
      isOrgMember,
      started: startedIds.has(courseId),
      courseId
    });

    if (cta.mode === 'open') {
      links.set(courseId, { href: cta.href, started: cta.started });
    }
  }

  return links;
}
