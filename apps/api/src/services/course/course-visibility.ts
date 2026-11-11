import { AppError, ErrorCodes } from '@api/utils/errors';
import { isCourseTeamMemberOrOrgAdmin } from '@cio/db/queries/group';
import { getCourseAudienceBySlug, type PublicCourseReadOptions } from '@cio/db/queries/course';
import { evaluateCourseOpen, type CourseOpenDecision } from '@cio/utils/functions';

export type CourseAudience = NonNullable<Awaited<ReturnType<typeof getCourseAudienceBySlug>>>;

export type CourseViewer = {
  userId: string | null;
  orgRoles: Record<string, number>;
};

export function viewerFromAuth(
  user: { id: string } | null | undefined,
  orgRoles: Record<string, number> | null | undefined
): CourseViewer {
  return {
    userId: user?.id ?? null,
    orgRoles: orgRoles ?? {}
  };
}

/**
 * Throws 404 when the course must stay hidden and 401 when an anonymous visitor must sign in.
 */
export async function requireCourseSlugAccess(courseSlug: string, viewer: CourseViewer): Promise<CourseAudience> {
  const course = await getCourseAudienceBySlug(courseSlug);
  if (!course || course.status !== 'ACTIVE') {
    throw new AppError('Course not found', ErrorCodes.COURSE_NOT_FOUND, 404);
  }

  const orgRoleId = course.organizationId ? viewer.orgRoles[course.organizationId] : undefined;
  const isOrgMember = orgRoleId != null;
  let isCourseStaff = false;

  if (!course.isPublished && viewer.userId) {
    isCourseStaff = await isCourseTeamMemberOrOrgAdmin(course.id, viewer.userId);
  }

  const decision: CourseOpenDecision = evaluateCourseOpen({
    isPublished: course.isPublished,
    membersOnly: course.membersOnlyCatalog,
    isAuthenticated: Boolean(viewer.userId),
    isOrgMember,
    isCourseStaff
  });

  if (decision === 'hidden') {
    throw new AppError('Course not found', ErrorCodes.COURSE_NOT_FOUND, 404);
  }

  if (decision === 'sign-in') {
    throw new AppError('Sign in to view this course', ErrorCodes.CATALOG_MEMBERS_ONLY, 401);
  }

  return course;
}

export async function publicCourseReadOptions(
  courseSlug: string,
  viewer: CourseViewer
): Promise<PublicCourseReadOptions> {
  const course = await requireCourseSlugAccess(courseSlug, viewer);

  return { includeUnpublished: !course.isPublished };
}
