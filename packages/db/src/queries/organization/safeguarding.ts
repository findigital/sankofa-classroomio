import * as schema from '@db/schema';

import { and, desc, eq } from 'drizzle-orm';

import { ROLE } from '@cio/utils/constants';
import {
  EMPTY_SAFEGUARDING,
  safeguardingSnapshotsEqual,
  type SafeguardingSnapshot,
  type TFellowConsentStatus
} from '@cio/utils/validation/organization';
import { type DbOrTxClient, db } from '@db/drizzle';

export type OrgMemberRecord = {
  id: number;
  profileId: string | null;
  email: string | null;
  roleId: number;
};

export type SafeguardingAuditEntry = {
  id: string;
  actorProfileId: string | null;
  actorEmail: string | null;
  before: SafeguardingSnapshot;
  after: SafeguardingSnapshot;
  createdAt: string;
};

function asSnapshot(value: unknown): SafeguardingSnapshot {
  if (!value || typeof value !== 'object') return { ...EMPTY_SAFEGUARDING };

  const record = value as Partial<SafeguardingSnapshot>;

  return {
    isMinor: Boolean(record.isMinor),
    guardianName: record.guardianName ?? null,
    guardianEmail: record.guardianEmail ?? null,
    guardianPhone: record.guardianPhone ?? null,
    consentStatus: (record.consentStatus ?? 'none') as TFellowConsentStatus,
    consentAt: record.consentAt ?? null,
    notes: record.notes ?? null
  };
}

function rowToSnapshot(
  row: typeof schema.organizationMemberSafeguarding.$inferSelect | undefined
): SafeguardingSnapshot {
  if (!row) return { ...EMPTY_SAFEGUARDING };

  return {
    isMinor: row.isMinor,
    guardianName: row.guardianName,
    guardianEmail: row.guardianEmail,
    guardianPhone: row.guardianPhone,
    consentStatus: row.consentStatus,
    consentAt: row.consentAt,
    notes: row.notes
  };
}

/** Active member in this organization, or null when the id belongs elsewhere. */
export async function getActiveOrgMemberById(
  organizationId: string,
  memberId: number,
  dbClient: DbOrTxClient = db
): Promise<OrgMemberRecord | null> {
  try {
    const [row] = await dbClient
      .select({
        id: schema.organizationmember.id,
        profileId: schema.organizationmember.profileId,
        email: schema.organizationmember.email,
        roleId: schema.organizationmember.roleId
      })
      .from(schema.organizationmember)
      .where(
        and(
          eq(schema.organizationmember.id, memberId),
          eq(schema.organizationmember.organizationId, organizationId),
          eq(schema.organizationmember.status, 'ACTIVE')
        )
      )
      .limit(1);

    return row ?? null;
  } catch (error) {
    console.error('getActiveOrgMemberById error:', error);
    throw new Error('Failed to load organization member');
  }
}

export async function getSafeguardingSnapshot(
  memberId: number,
  dbClient: DbOrTxClient = db
): Promise<SafeguardingSnapshot> {
  try {
    const [row] = await dbClient
      .select()
      .from(schema.organizationMemberSafeguarding)
      .where(eq(schema.organizationMemberSafeguarding.organizationMemberId, memberId))
      .limit(1);

    return rowToSnapshot(row);
  } catch (error) {
    console.error('getSafeguardingSnapshot error:', error);
    throw new Error('Failed to load safeguarding record');
  }
}

/**
 * True when `mentorProfileId` is assigned to `fellowProfileId` in this organization.
 */
export async function isMentorOfFellow(
  organizationId: string,
  mentorProfileId: string,
  fellowProfileId: string,
  dbClient: DbOrTxClient = db
): Promise<boolean> {
  try {
    const [row] = await dbClient
      .select({ id: schema.mentorAssignment.id })
      .from(schema.mentorAssignment)
      .where(
        and(
          eq(schema.mentorAssignment.organizationId, organizationId),
          eq(schema.mentorAssignment.mentorProfileId, mentorProfileId),
          eq(schema.mentorAssignment.fellowProfileId, fellowProfileId)
        )
      )
      .limit(1);

    return Boolean(row);
  } catch (error) {
    console.error('isMentorOfFellow error:', error);
    throw new Error('Failed to resolve mentor assignment');
  }
}

/**
 * Writes the safeguarding row and, when a value changed, an audit row.
 * Returns the stored snapshot. Caller owns the transaction.
 */
export async function writeSafeguarding(
  input: {
    organizationId: string;
    member: OrgMemberRecord;
    actorProfileId: string;
    next: SafeguardingSnapshot;
  },
  dbClient: DbOrTxClient = db
): Promise<SafeguardingSnapshot> {
  const before = await getSafeguardingSnapshot(input.member.id, dbClient);
  const next = input.next.consentStatus === 'none' ? { ...input.next, consentAt: null } : input.next;

  try {
    await dbClient
      .insert(schema.organizationMemberSafeguarding)
      .values({
        organizationMemberId: input.member.id,
        isMinor: next.isMinor,
        guardianName: next.guardianName,
        guardianEmail: next.guardianEmail,
        guardianPhone: next.guardianPhone,
        consentStatus: next.consentStatus,
        consentAt: next.consentAt,
        notes: next.notes,
        updatedBy: input.actorProfileId
      })
      .onConflictDoUpdate({
        target: schema.organizationMemberSafeguarding.organizationMemberId,
        set: {
          isMinor: next.isMinor,
          guardianName: next.guardianName,
          guardianEmail: next.guardianEmail,
          guardianPhone: next.guardianPhone,
          consentStatus: next.consentStatus,
          consentAt: next.consentAt,
          notes: next.notes,
          updatedBy: input.actorProfileId,
          updatedAt: new Date().toISOString()
        }
      });

    if (!safeguardingSnapshotsEqual(before, next)) {
      const [actor] = await dbClient
        .select({ email: schema.profile.email })
        .from(schema.profile)
        .where(eq(schema.profile.id, input.actorProfileId))
        .limit(1);

      await dbClient.insert(schema.organizationMemberSafeguardingAudit).values({
        organizationId: input.organizationId,
        memberId: input.member.id,
        profileId: input.member.profileId,
        targetEmail: input.member.email,
        actorProfileId: input.actorProfileId,
        actorEmail: actor?.email ?? null,
        before,
        after: next
      });
    }

    return next;
  } catch (error) {
    console.error('writeSafeguarding error:', error);
    throw new Error('Failed to save safeguarding record');
  }
}

export async function listSafeguardingAudit(
  organizationId: string,
  memberId: number,
  dbClient: DbOrTxClient = db
): Promise<SafeguardingAuditEntry[]> {
  try {
    const rows = await dbClient
      .select({
        id: schema.organizationMemberSafeguardingAudit.id,
        actorProfileId: schema.organizationMemberSafeguardingAudit.actorProfileId,
        actorEmail: schema.organizationMemberSafeguardingAudit.actorEmail,
        before: schema.organizationMemberSafeguardingAudit.before,
        after: schema.organizationMemberSafeguardingAudit.after,
        createdAt: schema.organizationMemberSafeguardingAudit.createdAt
      })
      .from(schema.organizationMemberSafeguardingAudit)
      .where(
        and(
          eq(schema.organizationMemberSafeguardingAudit.organizationId, organizationId),
          eq(schema.organizationMemberSafeguardingAudit.memberId, memberId)
        )
      )
      .orderBy(desc(schema.organizationMemberSafeguardingAudit.createdAt))
      .limit(50);

    return rows.map((row) => ({
      id: row.id,
      actorProfileId: row.actorProfileId,
      actorEmail: row.actorEmail,
      before: asSnapshot(row.before),
      after: asSnapshot(row.after),
      createdAt: row.createdAt
    }));
  } catch (error) {
    console.error('listSafeguardingAudit error:', error);
    throw new Error('Failed to list safeguarding audit');
  }
}

export async function listActiveStudents(
  organizationId: string,
  dbClient: DbOrTxClient = db
): Promise<Array<{ profileId: string; memberId: number; name: string; email: string | null }>> {
  try {
    const rows = await dbClient
      .select({
        profileId: schema.organizationmember.profileId,
        memberId: schema.organizationmember.id,
        name: schema.profile.fullname,
        profileEmail: schema.profile.email,
        memberEmail: schema.organizationmember.email
      })
      .from(schema.organizationmember)
      .leftJoin(schema.profile, eq(schema.profile.id, schema.organizationmember.profileId))
      .where(
        and(
          eq(schema.organizationmember.organizationId, organizationId),
          eq(schema.organizationmember.roleId, ROLE.STUDENT),
          eq(schema.organizationmember.status, 'ACTIVE')
        )
      );

    return rows.flatMap((row) => {
      if (!row.profileId) return [];

      const email = row.profileEmail ?? row.memberEmail;

      return [
        {
          profileId: row.profileId,
          memberId: row.memberId,
          name: row.name || email || '',
          email
        }
      ];
    });
  } catch (error) {
    console.error('listActiveStudents error:', error);
    throw new Error('Failed to list fellows');
  }
}
