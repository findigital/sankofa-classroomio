import * as schema from '@db/schema';

import { and, eq, inArray } from 'drizzle-orm';

import { ROLE } from '@cio/utils/constants';
import { type DbOrTxClient, db } from '@db/drizzle';

export type MentorRosterFellow = {
  profileId: string;
  memberId: number;
  name: string;
  email: string | null;
};

export type MentorRosterEntry = {
  mentorProfileId: string;
  mentorName: string;
  mentorEmail: string | null;
  fellows: MentorRosterFellow[];
};

type ActiveProfile = {
  profileId: string;
  memberId: number;
  roleId: number;
  name: string;
  email: string | null;
};

async function listActiveProfiles(
  organizationId: string,
  roleId: number,
  profileIds: string[] | null,
  dbClient: DbOrTxClient
): Promise<ActiveProfile[]> {
  const filters = [
    eq(schema.organizationmember.organizationId, organizationId),
    eq(schema.organizationmember.roleId, roleId),
    eq(schema.organizationmember.status, 'ACTIVE')
  ];

  if (profileIds) {
    if (profileIds.length === 0) return [];

    filters.push(inArray(schema.organizationmember.profileId, profileIds));
  }

  const rows = await dbClient
    .select({
      profileId: schema.organizationmember.profileId,
      memberId: schema.organizationmember.id,
      roleId: schema.organizationmember.roleId,
      name: schema.profile.fullname,
      profileEmail: schema.profile.email,
      memberEmail: schema.organizationmember.email
    })
    .from(schema.organizationmember)
    .leftJoin(schema.profile, eq(schema.profile.id, schema.organizationmember.profileId))
    .where(and(...filters));

  return rows.flatMap((row) => {
    if (!row.profileId) return [];

    const email = row.profileEmail ?? row.memberEmail;

    return [
      {
        profileId: row.profileId,
        memberId: row.memberId,
        roleId: row.roleId,
        name: row.name || email || '',
        email
      }
    ];
  });
}

/**
 * Tutors and the fellows assigned to each of them.
 * When `mentorProfileId` is set, only that tutor is returned.
 */
export async function listMentorRoster(
  organizationId: string,
  mentorProfileId: string | null,
  dbClient: DbOrTxClient = db
): Promise<MentorRosterEntry[]> {
  try {
    const tutors = await listActiveProfiles(
      organizationId,
      ROLE.TUTOR,
      mentorProfileId ? [mentorProfileId] : null,
      dbClient
    );
    const assignments = await dbClient
      .select({
        mentorProfileId: schema.mentorAssignment.mentorProfileId,
        fellowProfileId: schema.mentorAssignment.fellowProfileId
      })
      .from(schema.mentorAssignment)
      .where(
        mentorProfileId
          ? and(
              eq(schema.mentorAssignment.organizationId, organizationId),
              eq(schema.mentorAssignment.mentorProfileId, mentorProfileId)
            )
          : eq(schema.mentorAssignment.organizationId, organizationId)
      );
    const fellowIds = [...new Set(assignments.map((row) => row.fellowProfileId))];
    const fellows = await listActiveProfiles(organizationId, ROLE.STUDENT, fellowIds, dbClient);
    const fellowsById = new Map(fellows.map((fellow) => [fellow.profileId, fellow]));

    return tutors
      .map((tutor) => ({
        mentorProfileId: tutor.profileId,
        mentorName: tutor.name,
        mentorEmail: tutor.email,
        fellows: assignments
          .filter((assignment) => assignment.mentorProfileId === tutor.profileId)
          .flatMap((assignment) => {
            const fellow = fellowsById.get(assignment.fellowProfileId);

            if (!fellow) return [];

            return [
              {
                profileId: fellow.profileId,
                memberId: fellow.memberId,
                name: fellow.name,
                email: fellow.email
              }
            ];
          })
      }))
      .sort((left, right) => left.mentorName.localeCompare(right.mentorName));
  } catch (error) {
    console.error('listMentorRoster error:', error);
    throw new Error('Failed to list mentor assignments');
  }
}

/**
 * Replaces one mentor's fellow set. Fellows who are not active students, and a
 * mentor who is not an active tutor, are reported by returning null for that role.
 */
export async function replaceMentorFellows(
  input: {
    organizationId: string;
    mentorProfileId: string;
    fellowProfileIds: string[];
    assignedBy: string;
  },
  dbClient: DbOrTxClient
): Promise<{ mentorFound: boolean; missingFellowIds: string[] }> {
  try {
    const [mentor] = await listActiveProfiles(input.organizationId, ROLE.TUTOR, [input.mentorProfileId], dbClient);

    if (!mentor) {
      return { mentorFound: false, missingFellowIds: [] };
    }

    const fellows = await listActiveProfiles(input.organizationId, ROLE.STUDENT, input.fellowProfileIds, dbClient);
    const foundIds = new Set(fellows.map((fellow) => fellow.profileId));
    const missingFellowIds = input.fellowProfileIds.filter((profileId) => !foundIds.has(profileId));

    if (missingFellowIds.length > 0) {
      return { mentorFound: true, missingFellowIds };
    }

    const existing = await dbClient
      .select({
        id: schema.mentorAssignment.id,
        fellowProfileId: schema.mentorAssignment.fellowProfileId
      })
      .from(schema.mentorAssignment)
      .where(
        and(
          eq(schema.mentorAssignment.organizationId, input.organizationId),
          eq(schema.mentorAssignment.mentorProfileId, input.mentorProfileId)
        )
      );
    const desired = new Set(input.fellowProfileIds);
    const removeIds = existing.filter((row) => !desired.has(row.fellowProfileId)).map((row) => row.id);
    const currentFellows = new Set(existing.map((row) => row.fellowProfileId));
    const insertIds = input.fellowProfileIds.filter((profileId) => !currentFellows.has(profileId));

    if (removeIds.length > 0) {
      await dbClient.delete(schema.mentorAssignment).where(inArray(schema.mentorAssignment.id, removeIds));
    }

    if (insertIds.length > 0) {
      await dbClient.insert(schema.mentorAssignment).values(
        insertIds.map((fellowProfileId) => ({
          organizationId: input.organizationId,
          mentorProfileId: input.mentorProfileId,
          fellowProfileId,
          assignedBy: input.assignedBy
        }))
      );
    }

    return { mentorFound: true, missingFellowIds: [] };
  } catch (error) {
    console.error('replaceMentorFellows error:', error);
    throw new Error('Failed to save mentor assignments');
  }
}
