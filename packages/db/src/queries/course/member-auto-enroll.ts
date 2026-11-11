import * as schema from '@db/schema';

import { and, eq, gt, inArray, isNotNull, isNull, ne, notExists, or } from 'drizzle-orm';

import { ROLE } from '@cio/utils/constants';
import { isAutoEnrollMembersEnabled } from '@cio/utils/functions';
import { db, type DbOrTxClient } from '@db/drizzle';

export async function listPublishedCourseGroupsForAutoEnroll(
  orgId: string,
  courseIds?: string[],
  dbClient: DbOrTxClient = db
): Promise<Array<{ courseId: string; groupId: string; isPublished: true }>> {
  try {
    const filters = [
      eq(schema.group.organizationId, orgId),
      eq(schema.course.isPublished, true),
      eq(schema.course.status, 'ACTIVE'),
      eq(schema.course.isTemplate, false),
      isNotNull(schema.course.groupId)
    ];

    if (courseIds && courseIds.length > 0) {
      filters.push(inArray(schema.course.id, courseIds));
    }

    const rows = await dbClient
      .select({
        courseId: schema.course.id,
        groupId: schema.course.groupId,
        isPublished: schema.course.isPublished
      })
      .from(schema.course)
      .innerJoin(schema.group, eq(schema.course.groupId, schema.group.id))
      .where(and(...filters));

    return rows.flatMap((row) =>
      row.groupId && row.isPublished
        ? [{ courseId: row.courseId, groupId: row.groupId, isPublished: true as const }]
        : []
    );
  } catch (error) {
    console.error('listPublishedCourseGroupsForAutoEnroll error:', error);
    throw new Error(
      `Failed to list published course groups: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export async function listActiveOrgStudentsForAutoEnroll(
  orgId: string,
  profileIds?: string[],
  dbClient: DbOrTxClient = db
): Promise<Array<{ profileId: string; email: string | null }>> {
  try {
    const filters = [
      eq(schema.organizationmember.organizationId, orgId),
      eq(schema.organizationmember.roleId, ROLE.STUDENT),
      eq(schema.organizationmember.status, 'ACTIVE'),
      isNotNull(schema.organizationmember.profileId)
    ];

    if (profileIds && profileIds.length > 0) {
      filters.push(inArray(schema.organizationmember.profileId, profileIds));
    }

    const rows = await dbClient
      .select({
        profileId: schema.organizationmember.profileId,
        email: schema.organizationmember.email
      })
      .from(schema.organizationmember)
      .where(and(...filters));

    return rows.flatMap((row) => (row.profileId ? [{ profileId: row.profileId, email: row.email }] : []));
  } catch (error) {
    console.error('listActiveOrgStudentsForAutoEnroll error:', error);
    throw new Error(
      `Failed to list organization students: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export async function listStartedCourseIdsForProfile(
  profileId: string,
  courseIds: string[],
  dbClient: DbOrTxClient = db
): Promise<string[]> {
  try {
    if (courseIds.length === 0) return [];

    const rows = await dbClient
      .selectDistinct({ courseId: schema.lesson.courseId })
      .from(schema.lessonCompletion)
      .innerJoin(schema.lesson, eq(schema.lessonCompletion.lessonId, schema.lesson.id))
      .where(and(eq(schema.lessonCompletion.profileId, profileId), inArray(schema.lesson.courseId, courseIds)));

    return rows.map((row) => row.courseId);
  } catch (error) {
    console.error('listStartedCourseIdsForProfile error:', error);
    throw new Error(`Failed to list started courses: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function listCourseTutorProfiles(
  courseId: string,
  dbClient: DbOrTxClient = db
): Promise<Array<{ name: string; avatarUrl: string | null; courseRoleId: number; orgRoleId: number | null }>> {
  try {
    const rows = await dbClient
      .select({
        name: schema.profile.fullname,
        avatarUrl: schema.profile.avatarUrl,
        courseRoleId: schema.groupmember.roleId,
        orgRoleId: schema.organizationmember.roleId
      })
      .from(schema.groupmember)
      .innerJoin(schema.course, eq(schema.course.groupId, schema.groupmember.groupId))
      .innerJoin(schema.group, eq(schema.group.id, schema.course.groupId))
      .innerJoin(schema.profile, eq(schema.profile.id, schema.groupmember.profileId))
      .leftJoin(
        schema.organizationmember,
        and(
          eq(schema.organizationmember.organizationId, schema.group.organizationId),
          eq(schema.organizationmember.profileId, schema.profile.id),
          eq(schema.organizationmember.status, 'ACTIVE')
        )
      )
      .where(
        and(
          eq(schema.course.id, courseId),
          or(eq(schema.groupmember.roleId, ROLE.TUTOR), eq(schema.groupmember.roleId, ROLE.ADMIN))
        )
      );

    return rows.flatMap((row) => {
      const name = row.name?.trim();
      if (!name) return [];

      return [
        {
          name,
          avatarUrl: row.avatarUrl,
          courseRoleId: row.courseRoleId,
          orgRoleId: row.orgRoleId
        }
      ];
    });
  } catch (error) {
    console.error('listCourseTutorProfiles error:', error);
    throw new Error(`Failed to list course tutors: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Deletes student memberships on unpublished courses that have no lesson progress or submissions.
 * Rows that record progress stay, and this does not delete progress or submission rows.
 */
export async function removeUnpublishedStudentMembershipsWithoutProgress(
  orgId: string,
  profileIds?: string[],
  dbClient: DbOrTxClient = db
): Promise<number> {
  try {
    const filters = [
      eq(schema.group.organizationId, orgId),
      eq(schema.course.isPublished, false),
      eq(schema.groupmember.roleId, ROLE.STUDENT),
      isNull(schema.groupmember.completedAt),
      isNull(schema.groupmember.certificateEarnedAt),
      notExists(
        dbClient
          .select({ id: schema.lessonCompletion.id })
          .from(schema.lessonCompletion)
          .innerJoin(schema.lesson, eq(schema.lessonCompletion.lessonId, schema.lesson.id))
          .where(
            and(
              eq(schema.lesson.courseId, schema.course.id),
              eq(schema.lessonCompletion.profileId, schema.groupmember.profileId)
            )
          )
      ),
      notExists(
        dbClient
          .select({ id: schema.lessonVideoProgress.id })
          .from(schema.lessonVideoProgress)
          .innerJoin(schema.lesson, eq(schema.lessonVideoProgress.lessonId, schema.lesson.id))
          .where(
            and(
              eq(schema.lesson.courseId, schema.course.id),
              eq(schema.lessonVideoProgress.profileId, schema.groupmember.profileId)
            )
          )
      ),
      notExists(
        dbClient
          .select({ id: schema.submission.id })
          .from(schema.submission)
          .where(eq(schema.submission.submittedBy, schema.groupmember.id))
      ),
      notExists(
        dbClient
          .select({ id: schema.questionAnswer.id })
          .from(schema.questionAnswer)
          .where(eq(schema.questionAnswer.groupMemberId, schema.groupmember.id))
      ),
      notExists(
        dbClient
          .select({ id: schema.courseCompletionRecord.id })
          .from(schema.courseCompletionRecord)
          .where(
            and(
              eq(schema.courseCompletionRecord.groupMemberId, schema.groupmember.id),
              or(
                isNotNull(schema.courseCompletionRecord.startedAt),
                isNotNull(schema.courseCompletionRecord.completedAt),
                isNotNull(schema.courseCompletionRecord.score),
                gt(schema.courseCompletionRecord.attempts, 0),
                gt(schema.courseCompletionRecord.timeSpentMinutes, 0),
                ne(schema.courseCompletionRecord.status, 'not_started')
              )
            )
          )
      ),
      notExists(
        dbClient
          .select({ id: schema.groupAttendance.id })
          .from(schema.groupAttendance)
          .where(eq(schema.groupAttendance.studentId, schema.groupmember.id))
      ),
      notExists(
        dbClient
          .select({ id: schema.lessonComment.id })
          .from(schema.lessonComment)
          .where(eq(schema.lessonComment.groupmemberId, schema.groupmember.id))
      ),
      notExists(
        dbClient
          .select({ id: schema.courseNewsfeed.id })
          .from(schema.courseNewsfeed)
          .where(eq(schema.courseNewsfeed.authorId, schema.groupmember.id))
      ),
      notExists(
        dbClient
          .select({ id: schema.courseNewsfeedComment.id })
          .from(schema.courseNewsfeedComment)
          .where(eq(schema.courseNewsfeedComment.authorId, schema.groupmember.id))
      )
    ];

    if (profileIds && profileIds.length > 0) {
      filters.push(inArray(schema.groupmember.profileId, profileIds));
    }

    const candidates = await dbClient
      .select({ id: schema.groupmember.id })
      .from(schema.groupmember)
      .innerJoin(schema.course, eq(schema.course.groupId, schema.groupmember.groupId))
      .innerJoin(schema.group, eq(schema.group.id, schema.course.groupId))
      .where(and(...filters));

    if (candidates.length === 0) return 0;

    const deleted = await dbClient
      .delete(schema.groupmember)
      .where(
        inArray(
          schema.groupmember.id,
          candidates.map((candidate) => candidate.id)
        )
      )
      .returning({ id: schema.groupmember.id });

    return deleted.length;
  } catch (error) {
    console.error('removeUnpublishedStudentMembershipsWithoutProgress error:', error);
    throw new Error(
      `Failed to remove unpublished student memberships: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export async function listOrganizationIdsForMemberAutoEnroll(dbClient: DbOrTxClient = db): Promise<string[]> {
  try {
    const rows = await dbClient
      .select({
        id: schema.organization.id,
        settings: schema.organization.settings
      })
      .from(schema.organization);

    return rows.filter((row) => isAutoEnrollMembersEnabled(row.settings)).map((row) => row.id);
  } catch (error) {
    console.error('listOrganizationIdsForMemberAutoEnroll error:', error);
    throw new Error(
      `Failed to list organizations for member auto-enroll: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
