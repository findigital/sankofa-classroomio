import * as schema from '@db/schema';

import { and, asc, eq, sql } from 'drizzle-orm';

import { ROLE } from '@cio/utils/constants';
import { fellowPaceFlags, type FellowPaceFlag } from '@cio/utils/functions/fellow-pace';
import { type DbOrTxClient, db } from '@db/drizzle';

import { isExerciseCompletedSql } from '../course/progression';

export type FellowPaceOverdueItem = {
  courseId: string;
  courseTitle: string;
  exerciseId: string;
  title: string;
  dueBy: string;
};

export type FellowPaceMentor = {
  profileId: string;
  name: string;
};

export type FellowPaceFellow = {
  memberId: number;
  profileId: string;
  name: string;
  email: string | null;
  isMinor: boolean;
  lastActivityAt: string | null;
  lessonsCompleted: number;
  lessonsRequired: number;
  exercisesCompleted: number;
  exercisesRequired: number;
  overdueCount: number;
  overdueItems: FellowPaceOverdueItem[];
  mentors: FellowPaceMentor[];
  flags: FellowPaceFlag[];
  pace: 'on_pace' | 'needs_attention';
};

export type ListFellowPaceInput = {
  organizationId: string;
  courseId: string | null;
  cohortId: string | null;
  mentorProfileId: string | null;
  quietDays: number;
  now?: Date;
};

type PaceSqlRow = {
  memberId: number | string;
  profileId: string;
  name: string | null;
  email: string | null;
  isMinor: boolean;
  lastActivityAt: Date | string | null;
  lessonsCompleted: number | string;
  lessonsRequired: number | string;
  exercisesCompleted: number | string;
  exercisesRequired: number | string;
  overdueCount: number | string;
  overdueItems: unknown;
  mentors: unknown;
};

function asNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
}

function asIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;

      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }

  return [];
}

function paceRank(flags: FellowPaceFlag[]): number {
  const overdue = flags.includes('overdue');
  const quiet = flags.includes('gone_quiet');

  if (overdue && quiet) return 0;
  if (overdue) return 1;
  if (quiet) return 2;

  return 3;
}

/**
 * Fellows in the requested course and/or cohort, with lesson and exercise
 * totals limited to enrollments inside that scope.
 *
 * When `mentorProfileId` is set, fellows not assigned to that mentor are omitted.
 * The selected columns never include guardian contact, consent, or notes.
 */
export async function listFellowPace(
  input: ListFellowPaceInput,
  dbClient: DbOrTxClient = db
): Promise<FellowPaceFellow[]> {
  const courseId = input.courseId;
  const cohortId = input.cohortId;
  const mentorProfileId = input.mentorProfileId;
  const completedExercise = isExerciseCompletedSql('ex', { groupMemberId: sql`es.group_member_id` });

  try {
    const result = await dbClient.execute(sql`
      WITH params AS (
        SELECT
          ${input.organizationId}::uuid AS organization_id,
          ${courseId}::uuid AS course_id,
          ${cohortId}::uuid AS cohort_id,
          ${mentorProfileId}::uuid AS mentor_profile_id
      ),
      scoped_courses AS (
        SELECT c.id, c.title, c.group_id
        FROM course c
        INNER JOIN "group" g ON g.id = c.group_id
        CROSS JOIN params p
        WHERE g.organization_id = p.organization_id
          AND (p.course_id IS NULL OR c.id = p.course_id)
          AND (
            p.cohort_id IS NULL
            OR c.id IN (SELECT cc.course_id FROM cohort_course cc WHERE cc.cohort_id = p.cohort_id)
          )
      ),
      candidate AS (
        SELECT gm.profile_id
        FROM groupmember gm
        INNER JOIN scoped_courses sc ON sc.group_id = gm.group_id
        CROSS JOIN params p
        WHERE p.course_id IS NOT NULL
          AND gm.role_id = ${ROLE.STUDENT}
          AND gm.profile_id IS NOT NULL
          AND (
            p.cohort_id IS NULL
            OR EXISTS (
              SELECT 1
              FROM cohort_member cm
              WHERE cm.cohort_id = p.cohort_id
                AND cm.profile_id = gm.profile_id
                AND cm.role_id = ${ROLE.STUDENT}
            )
          )

        UNION

        SELECT cm.profile_id
        FROM cohort_member cm
        CROSS JOIN params p
        WHERE p.cohort_id IS NOT NULL
          AND p.course_id IS NULL
          AND cm.cohort_id = p.cohort_id
          AND cm.role_id = ${ROLE.STUDENT}
          AND cm.profile_id IS NOT NULL

        UNION

        SELECT om.profile_id
        FROM organizationmember om
        CROSS JOIN params p
        WHERE p.course_id IS NULL
          AND p.cohort_id IS NULL
          AND om.organization_id = p.organization_id
          AND om.role_id = ${ROLE.STUDENT}
          AND om.status = 'ACTIVE'
          AND om.profile_id IS NOT NULL
      ),
      fellows AS (
        SELECT om.id AS member_id, om.profile_id, om.email AS member_email, om.last_active_at
        FROM organizationmember om
        INNER JOIN candidate c ON c.profile_id = om.profile_id
        CROSS JOIN params p
        WHERE om.organization_id = p.organization_id
          AND om.role_id = ${ROLE.STUDENT}
          AND om.status = 'ACTIVE'
          AND om.profile_id IS NOT NULL
          AND (
            p.mentor_profile_id IS NULL
            OR EXISTS (
              SELECT 1
              FROM mentor_assignment ma
              WHERE ma.organization_id = p.organization_id
                AND ma.mentor_profile_id = p.mentor_profile_id
                AND ma.fellow_profile_id = om.profile_id
            )
          )
      ),
      enrolled AS (
        SELECT DISTINCT gm.profile_id, gm.id AS group_member_id, sc.id AS course_id, sc.title AS course_title
        FROM fellows f
        INNER JOIN groupmember gm ON gm.profile_id = f.profile_id AND gm.role_id = ${ROLE.STUDENT}
        INNER JOIN scoped_courses sc ON sc.group_id = gm.group_id
      ),
      lesson_totals AS (
        SELECT
          e.profile_id,
          COUNT(DISTINCT l.id) FILTER (WHERE l.completion_policy <> 'none')::int AS lessons_required,
          COUNT(DISTINCT l.id) FILTER (
            WHERE l.completion_policy <> 'none'
              AND EXISTS (
                SELECT 1
                FROM lesson_completion lc
                WHERE lc.lesson_id = l.id
                  AND lc.profile_id = e.profile_id
                  AND lc.is_complete = true
              )
          )::int AS lessons_completed
        FROM enrolled e
        LEFT JOIN lesson l ON l.course_id = e.course_id
        GROUP BY e.profile_id
      ),
      exercise_scope AS (
        SELECT DISTINCT ON (e.profile_id, ex.id)
          e.profile_id,
          e.group_member_id,
          ex.id AS exercise_id,
          ex.title AS exercise_title,
          ex.due_by,
          e.course_id,
          e.course_title
        FROM enrolled e
        INNER JOIN exercise ex
          ON ex.completion_policy <> 'none'
         AND (
           ex.course_id = e.course_id
           OR EXISTS (
             SELECT 1 FROM lesson el
             WHERE el.id = ex.lesson_id AND el.course_id = e.course_id
           )
         )
        ORDER BY e.profile_id, ex.id, e.group_member_id
      ),
      exercise_totals AS (
        SELECT
          es.profile_id,
          COUNT(DISTINCT es.exercise_id)::int AS exercises_required,
          COUNT(DISTINCT es.exercise_id) FILTER (WHERE ${completedExercise})::int AS exercises_completed
        FROM exercise_scope es
        INNER JOIN exercise ex ON ex.id = es.exercise_id
        GROUP BY es.profile_id
      ),
      overdue_rows AS (
        SELECT
          es.profile_id,
          es.course_id,
          es.course_title,
          es.exercise_id,
          es.exercise_title,
          es.due_by
        FROM exercise_scope es
        WHERE es.due_by IS NOT NULL
          AND es.due_by < timezone('utc', now())
          AND NOT EXISTS (
            SELECT 1
            FROM submission s
            WHERE s.exercise_id = es.exercise_id
              AND s.submitted_by = es.group_member_id
          )
      ),
      overdue_agg AS (
        SELECT
          profile_id,
          COUNT(*)::int AS overdue_count,
          jsonb_agg(
            jsonb_build_object(
              'courseId', course_id,
              'courseTitle', course_title,
              'exerciseId', exercise_id,
              'title', exercise_title,
              'dueBy', to_char(due_by, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
            )
            ORDER BY due_by
          ) AS items
        FROM overdue_rows
        GROUP BY profile_id
      ),
      activity AS (
        SELECT
          f.profile_id,
          GREATEST(
            f.last_active_at,
            (
              SELECT MAX(lc.updated_at)
              FROM lesson_completion lc
              INNER JOIN lesson l ON l.id = lc.lesson_id
              INNER JOIN course c ON c.id = l.course_id
              INNER JOIN "group" g ON g.id = c.group_id
              CROSS JOIN params p
              WHERE lc.profile_id = f.profile_id
                AND g.organization_id = p.organization_id
            ),
            (
              SELECT MAX(s.created_at)
              FROM submission s
              INNER JOIN groupmember gm ON gm.id = s.submitted_by
              INNER JOIN "group" g ON g.id = gm.group_id
              CROSS JOIN params p
              WHERE gm.profile_id = f.profile_id
                AND g.organization_id = p.organization_id
            )
          ) AS last_activity_at
        FROM fellows f
      ),
      mentor_agg AS (
        SELECT
          ma.fellow_profile_id AS profile_id,
          jsonb_agg(
            jsonb_build_object(
              'profileId', ma.mentor_profile_id,
              'name', COALESCE(NULLIF(mp.fullname, ''), mp.email, '')
            )
            ORDER BY mp.fullname
          ) AS mentors
        FROM mentor_assignment ma
        INNER JOIN profile mp ON mp.id = ma.mentor_profile_id
        CROSS JOIN params p
        WHERE ma.organization_id = p.organization_id
        GROUP BY ma.fellow_profile_id
      )
      SELECT
        f.member_id AS "memberId",
        f.profile_id AS "profileId",
        COALESCE(NULLIF(p.fullname, ''), p.email, f.member_email, '') AS "name",
        COALESCE(p.email, f.member_email) AS "email",
        COALESCE(sg.is_minor, false) AS "isMinor",
        activity.last_activity_at AS "lastActivityAt",
        COALESCE(lesson_totals.lessons_completed, 0) AS "lessonsCompleted",
        COALESCE(lesson_totals.lessons_required, 0) AS "lessonsRequired",
        COALESCE(exercise_totals.exercises_completed, 0) AS "exercisesCompleted",
        COALESCE(exercise_totals.exercises_required, 0) AS "exercisesRequired",
        COALESCE(overdue_agg.overdue_count, 0) AS "overdueCount",
        COALESCE(overdue_agg.items, '[]'::jsonb) AS "overdueItems",
        COALESCE(mentor_agg.mentors, '[]'::jsonb) AS "mentors"
      FROM fellows f
      LEFT JOIN profile p ON p.id = f.profile_id
      LEFT JOIN organization_member_safeguarding sg ON sg.organization_member_id = f.member_id
      LEFT JOIN activity ON activity.profile_id = f.profile_id
      LEFT JOIN lesson_totals ON lesson_totals.profile_id = f.profile_id
      LEFT JOIN exercise_totals ON exercise_totals.profile_id = f.profile_id
      LEFT JOIN overdue_agg ON overdue_agg.profile_id = f.profile_id
      LEFT JOIN mentor_agg ON mentor_agg.profile_id = f.profile_id
    `);

    const fellows = result.map((row) => {
      const record = row as unknown as PaceSqlRow;
      const overdueCount = asNumber(record.overdueCount);
      const lastActivityAt = asIso(record.lastActivityAt);
      const flags = fellowPaceFlags({
        lastActivityAt,
        overdueCount,
        quietDays: input.quietDays,
        now: input.now
      });

      return {
        memberId: asNumber(record.memberId),
        profileId: record.profileId,
        name: record.name ?? '',
        email: record.email,
        isMinor: Boolean(record.isMinor),
        lastActivityAt,
        lessonsCompleted: asNumber(record.lessonsCompleted),
        lessonsRequired: asNumber(record.lessonsRequired),
        exercisesCompleted: asNumber(record.exercisesCompleted),
        exercisesRequired: asNumber(record.exercisesRequired),
        overdueCount,
        overdueItems: asArray<FellowPaceOverdueItem>(record.overdueItems),
        mentors: asArray<FellowPaceMentor>(record.mentors),
        flags,
        pace: flags.length === 0 ? 'on_pace' : 'needs_attention'
      } satisfies FellowPaceFellow;
    });

    fellows.sort((left, right) => {
      const rank = paceRank(left.flags) - paceRank(right.flags);

      if (rank !== 0) return rank;

      return left.name.localeCompare(right.name);
    });

    return fellows;
  } catch (error) {
    console.error('listFellowPace error:', error);
    throw new Error('Failed to list fellow pace');
  }
}

/** Course and cohort choices for the staff pace filters. Rows stay mentor-scoped separately. */
export async function listPaceFilters(
  organizationId: string,
  dbClient: DbOrTxClient = db
): Promise<{ courses: { id: string; title: string }[]; cohorts: { id: string; name: string }[] }> {
  try {
    const courses = await dbClient
      .select({ id: schema.course.id, title: schema.course.title })
      .from(schema.course)
      .innerJoin(schema.group, eq(schema.course.groupId, schema.group.id))
      .where(
        and(
          eq(schema.group.organizationId, organizationId),
          eq(schema.course.isTemplate, false),
          eq(schema.course.isPublished, true)
        )
      )
      .orderBy(asc(schema.course.title));
    const cohorts = await dbClient
      .select({ id: schema.cohort.id, name: schema.cohort.name })
      .from(schema.cohort)
      .where(eq(schema.cohort.organizationId, organizationId))
      .orderBy(asc(schema.cohort.name));

    return { courses, cohorts };
  } catch (error) {
    console.error('listPaceFilters error:', error);
    throw new Error('Failed to list pace filters');
  }
}

export async function courseBelongsToOrg(
  organizationId: string,
  courseId: string,
  dbClient: DbOrTxClient = db
): Promise<boolean> {
  try {
    const [row] = await dbClient
      .select({ id: schema.course.id })
      .from(schema.course)
      .innerJoin(schema.group, eq(schema.course.groupId, schema.group.id))
      .where(and(eq(schema.course.id, courseId), eq(schema.group.organizationId, organizationId)))
      .limit(1);

    return Boolean(row);
  } catch (error) {
    console.error('courseBelongsToOrg error:', error);
    throw new Error('Failed to resolve course');
  }
}

export async function cohortBelongsToOrg(
  organizationId: string,
  cohortId: string,
  dbClient: DbOrTxClient = db
): Promise<boolean> {
  try {
    const [row] = await dbClient
      .select({ id: schema.cohort.id })
      .from(schema.cohort)
      .where(and(eq(schema.cohort.id, cohortId), eq(schema.cohort.organizationId, organizationId)))
      .limit(1);

    return Boolean(row);
  } catch (error) {
    console.error('cohortBelongsToOrg error:', error);
    throw new Error('Failed to resolve cohort');
  }
}

export async function cohortIncludesCourse(
  cohortId: string,
  courseId: string,
  dbClient: DbOrTxClient = db
): Promise<boolean> {
  try {
    const [row] = await dbClient
      .select({ id: schema.cohortCourse.id })
      .from(schema.cohortCourse)
      .where(and(eq(schema.cohortCourse.cohortId, cohortId), eq(schema.cohortCourse.courseId, courseId)))
      .limit(1);

    return Boolean(row);
  } catch (error) {
    console.error('cohortIncludesCourse error:', error);
    throw new Error('Failed to resolve cohort course');
  }
}
