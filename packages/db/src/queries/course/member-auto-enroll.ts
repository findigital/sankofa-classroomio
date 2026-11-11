import * as schema from '@db/schema';

import { and, eq, inArray, isNotNull } from 'drizzle-orm';

import { ROLE } from '@cio/utils/constants';
import { isAutoEnrollMembersEnabled } from '@cio/utils/functions';
import { db, type DbOrTxClient } from '@db/drizzle';

export async function listPublishedCourseGroupsForAutoEnroll(
  orgId: string,
  courseIds?: string[],
  dbClient: DbOrTxClient = db
): Promise<Array<{ courseId: string; groupId: string }>> {
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
        groupId: schema.course.groupId
      })
      .from(schema.course)
      .innerJoin(schema.group, eq(schema.course.groupId, schema.group.id))
      .where(and(...filters));

    return rows.flatMap((row) => (row.groupId ? [{ courseId: row.courseId, groupId: row.groupId }] : []));
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
): Promise<Array<{ name: string; avatarUrl: string | null }>> {
  try {
    const rows = await dbClient
      .select({
        name: schema.profile.fullname,
        avatarUrl: schema.profile.avatarUrl
      })
      .from(schema.groupmember)
      .innerJoin(schema.course, eq(schema.course.groupId, schema.groupmember.groupId))
      .innerJoin(schema.profile, eq(schema.profile.id, schema.groupmember.profileId))
      .where(and(eq(schema.course.id, courseId), eq(schema.groupmember.roleId, ROLE.TUTOR)));

    return rows.flatMap((row) => {
      const name = row.name?.trim();
      if (!name) return [];

      return [{ name, avatarUrl: row.avatarUrl }];
    });
  } catch (error) {
    console.error('listCourseTutorProfiles error:', error);
    throw new Error(`Failed to list course tutors: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
