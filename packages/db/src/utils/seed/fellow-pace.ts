import {
  account,
  and,
  cohort,
  cohortCourse,
  cohortMember,
  course,
  db,
  eq,
  exercise,
  group,
  groupmember,
  inArray,
  lesson,
  lessonCompletion,
  mentorAssignment,
  organizationMemberSafeguarding,
  organizationMemberSafeguardingAudit,
  organizationmember,
  profile,
  submission,
  user
} from '@db/drizzle';

import { ROLE } from '@cio/utils/constants';

const TEST_ORG_ID = '1a1dcddd-1abc-4f72-b644-0bd18191a289';
const ADMIN_USER_ID = '7ac00503-8519-43c8-a5ea-b79aeca900b1';
const DEMO_PASSWORD_HASH = '$2a$10$n8vBI6.pyE0W/RO9DcJDseLKF/CRwsU4X4Lc2MaQogt8pQgnJavTa';

const MENTOR_ID = '11111111-1111-4111-8111-111111111111';
const PACE_ID = '22222222-2222-4222-8222-222222222222';
const QUIET_ID = '33333333-3333-4333-8333-333333333333';
const OVERDUE_ID = '44444444-4444-4444-8444-444444444444';
const MINOR_ID = '55555555-5555-4555-8555-555555555555';
const GROUP_ID = '66666666-6666-4666-8666-666666666666';
const COURSE_ID = '77777777-7777-4777-8777-777777777777';
const LESSON_ONE_ID = '88888888-8888-4888-8888-888888888881';
const LESSON_TWO_ID = '88888888-8888-4888-8888-888888888882';
const DUE_EXERCISE_ID = '99999999-9999-4999-8999-999999999991';
const OPEN_EXERCISE_ID = '99999999-9999-4999-8999-999999999992';
const COHORT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MENTOR_MEMBER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const PACE_MEMBER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
const QUIET_MEMBER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3';
const OVERDUE_MEMBER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4';
const MINOR_MEMBER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5';
const AUDIT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const PEOPLE = [
  { id: MENTOR_ID, email: 'mentor@example.com', name: 'Sample Mentor', username: 'mentor-example', roleId: ROLE.TUTOR },
  {
    id: PACE_ID,
    email: 'pace.fellow@example.com',
    name: 'Pace Fellow',
    username: 'pace-fellow-example',
    roleId: ROLE.STUDENT
  },
  {
    id: QUIET_ID,
    email: 'quiet.fellow@example.com',
    name: 'Quiet Fellow',
    username: 'quiet-fellow-example',
    roleId: ROLE.STUDENT
  },
  {
    id: OVERDUE_ID,
    email: 'overdue.fellow@example.com',
    name: 'Overdue Fellow',
    username: 'overdue-fellow-example',
    roleId: ROLE.STUDENT
  },
  {
    id: MINOR_ID,
    email: 'minor.fellow@example.com',
    name: 'Minor Fellow',
    username: 'minor-fellow-example',
    roleId: ROLE.STUDENT
  }
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

/**
 * Sample fellowship roster for the staff pace view.
 * Every new address is @example.com. The login password matches the existing demo hash.
 */
export async function seedFellowPace() {
  const quietAt = isoDaysAgo(20);
  const recentAt = isoDaysAgo(1);
  const dueBy = isoDaysAgo(1).slice(0, 23).replace('T', ' ');
  const profileIds = PEOPLE.map((person) => person.id);

  await db
    .insert(user)
    .values(
      PEOPLE.map((person) => ({
        id: person.id,
        name: person.name,
        email: person.email,
        emailVerified: true
      }))
    )
    .onConflictDoNothing();

  await db
    .insert(profile)
    .values(
      PEOPLE.map((person) => ({
        id: person.id,
        fullname: person.name,
        username: person.username,
        email: person.email,
        canAddCourse: person.roleId !== ROLE.STUDENT,
        isEmailVerified: true
      }))
    )
    .onConflictDoNothing();

  await db
    .insert(account)
    .values(
      PEOPLE.map((person) => ({
        userId: person.id,
        providerId: 'credential',
        accountId: person.id,
        password: DEMO_PASSWORD_HASH
      }))
    )
    .onConflictDoNothing();

  await db
    .insert(organizationmember)
    .values(
      PEOPLE.map((person) => ({
        organizationId: TEST_ORG_ID,
        roleId: person.roleId,
        profileId: person.id,
        email: person.email,
        verified: true,
        status: 'ACTIVE' as const,
        lastActiveAt: person.id === QUIET_ID ? quietAt : recentAt
      }))
    )
    .onConflictDoNothing();

  await db
    .insert(group)
    .values({ id: GROUP_ID, name: 'Fellowship pace sample', organizationId: TEST_ORG_ID })
    .onConflictDoNothing();

  await db
    .insert(groupmember)
    .values([
      {
        id: MENTOR_MEMBER_ID,
        groupId: GROUP_ID,
        roleId: ROLE.TUTOR,
        profileId: MENTOR_ID,
        email: 'mentor@example.com'
      },
      {
        id: PACE_MEMBER_ID,
        groupId: GROUP_ID,
        roleId: ROLE.STUDENT,
        profileId: PACE_ID,
        email: 'pace.fellow@example.com'
      },
      {
        id: QUIET_MEMBER_ID,
        groupId: GROUP_ID,
        roleId: ROLE.STUDENT,
        profileId: QUIET_ID,
        email: 'quiet.fellow@example.com'
      },
      {
        id: OVERDUE_MEMBER_ID,
        groupId: GROUP_ID,
        roleId: ROLE.STUDENT,
        profileId: OVERDUE_ID,
        email: 'overdue.fellow@example.com'
      },
      {
        id: MINOR_MEMBER_ID,
        groupId: GROUP_ID,
        roleId: ROLE.STUDENT,
        profileId: MINOR_ID,
        email: 'minor.fellow@example.com'
      }
    ])
    .onConflictDoNothing();

  await db
    .insert(course)
    .values({
      id: COURSE_ID,
      title: 'Fellowship pace sample',
      description: 'Unpublished sample course for the staff pace view.',
      groupId: GROUP_ID,
      slug: 'fellowship-pace-sample',
      isPublished: false,
      isTemplate: false
    })
    .onConflictDoNothing();

  await db
    .insert(lesson)
    .values([
      { id: LESSON_ONE_ID, courseId: COURSE_ID, title: 'Opening session', slug: 'opening-session', order: 1 },
      { id: LESSON_TWO_ID, courseId: COURSE_ID, title: 'Workshop', slug: 'workshop', order: 2 }
    ])
    .onConflictDoNothing();

  await db
    .insert(exercise)
    .values([
      {
        id: DUE_EXERCISE_ID,
        courseId: COURSE_ID,
        title: 'Reflection due yesterday',
        slug: 'reflection-due-yesterday',
        order: 1,
        dueBy
      },
      {
        id: OPEN_EXERCISE_ID,
        courseId: COURSE_ID,
        title: 'Open reflection',
        slug: 'open-reflection',
        order: 2
      }
    ])
    .onConflictDoNothing();

  await db
    .insert(lessonCompletion)
    .values([
      { lessonId: LESSON_ONE_ID, profileId: PACE_ID, isComplete: true, updatedAt: recentAt },
      { lessonId: LESSON_TWO_ID, profileId: PACE_ID, isComplete: true, updatedAt: recentAt },
      { lessonId: LESSON_ONE_ID, profileId: QUIET_ID, isComplete: true, updatedAt: quietAt },
      { lessonId: LESSON_TWO_ID, profileId: QUIET_ID, isComplete: true, updatedAt: quietAt },
      { lessonId: LESSON_ONE_ID, profileId: OVERDUE_ID, isComplete: true, updatedAt: recentAt },
      { lessonId: LESSON_ONE_ID, profileId: MINOR_ID, isComplete: true, updatedAt: recentAt },
      { lessonId: LESSON_TWO_ID, profileId: MINOR_ID, isComplete: true, updatedAt: recentAt }
    ])
    .onConflictDoNothing();

  await db
    .insert(submission)
    .values([
      {
        id: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
        exerciseId: DUE_EXERCISE_ID,
        submittedBy: PACE_MEMBER_ID,
        courseId: COURSE_ID,
        createdAt: recentAt
      },
      {
        id: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2',
        exerciseId: DUE_EXERCISE_ID,
        submittedBy: QUIET_MEMBER_ID,
        courseId: COURSE_ID,
        createdAt: quietAt
      },
      {
        id: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd3',
        exerciseId: DUE_EXERCISE_ID,
        submittedBy: MINOR_MEMBER_ID,
        courseId: COURSE_ID,
        createdAt: recentAt
      }
    ])
    .onConflictDoNothing();

  await db
    .insert(cohort)
    .values({
      id: COHORT_ID,
      organizationId: TEST_ORG_ID,
      name: 'Sample fellowship',
      description: 'Sample cohort for the staff pace view.',
      createdByProfileId: ADMIN_USER_ID
    })
    .onConflictDoNothing();

  await db.insert(cohortCourse).values({ cohortId: COHORT_ID, courseId: COURSE_ID }).onConflictDoNothing();

  await db
    .insert(cohortMember)
    .values([
      { cohortId: COHORT_ID, profileId: MENTOR_ID, roleId: ROLE.TUTOR, email: 'mentor@example.com' },
      { cohortId: COHORT_ID, profileId: PACE_ID, roleId: ROLE.STUDENT, email: 'pace.fellow@example.com' },
      { cohortId: COHORT_ID, profileId: QUIET_ID, roleId: ROLE.STUDENT, email: 'quiet.fellow@example.com' },
      { cohortId: COHORT_ID, profileId: OVERDUE_ID, roleId: ROLE.STUDENT, email: 'overdue.fellow@example.com' },
      { cohortId: COHORT_ID, profileId: MINOR_ID, roleId: ROLE.STUDENT, email: 'minor.fellow@example.com' }
    ])
    .onConflictDoNothing();

  await db
    .insert(mentorAssignment)
    .values([
      { organizationId: TEST_ORG_ID, mentorProfileId: MENTOR_ID, fellowProfileId: QUIET_ID, assignedBy: ADMIN_USER_ID },
      {
        organizationId: TEST_ORG_ID,
        mentorProfileId: MENTOR_ID,
        fellowProfileId: OVERDUE_ID,
        assignedBy: ADMIN_USER_ID
      },
      { organizationId: TEST_ORG_ID, mentorProfileId: MENTOR_ID, fellowProfileId: MINOR_ID, assignedBy: ADMIN_USER_ID }
    ])
    .onConflictDoNothing();

  const members = await db
    .select({ id: organizationmember.id, profileId: organizationmember.profileId })
    .from(organizationmember)
    .where(and(eq(organizationmember.organizationId, TEST_ORG_ID), inArray(organizationmember.profileId, profileIds)));
  const minorMember = members.find((member) => member.profileId === MINOR_ID);

  if (!minorMember) return;

  const consentAt = '2026-01-15T00:00:00.000Z';
  const after = {
    isMinor: true,
    guardianName: 'Sample Guardian',
    guardianEmail: 'guardian@example.com',
    guardianPhone: '+1-202-555-0148',
    consentStatus: 'granted' as const,
    consentAt,
    notes: 'Fictional sample for the fellowship pace demo.'
  };

  await db
    .insert(organizationMemberSafeguarding)
    .values({
      organizationMemberId: minorMember.id,
      ...after,
      updatedBy: ADMIN_USER_ID
    })
    .onConflictDoNothing();

  await db
    .insert(organizationMemberSafeguardingAudit)
    .values({
      id: AUDIT_ID,
      organizationId: TEST_ORG_ID,
      memberId: minorMember.id,
      profileId: MINOR_ID,
      targetEmail: 'minor.fellow@example.com',
      actorProfileId: ADMIN_USER_ID,
      actorEmail: 'admin@test.com',
      before: {
        isMinor: false,
        guardianName: null,
        guardianEmail: null,
        guardianPhone: null,
        consentStatus: 'none',
        consentAt: null,
        notes: null
      },
      after
    })
    .onConflictDoNothing();
}
