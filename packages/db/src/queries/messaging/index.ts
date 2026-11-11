import * as schema from '@db/schema';

import { alias } from 'drizzle-orm/pg-core';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { ROLE } from '@cio/utils/constants';
import { isUniqueConstraintViolation } from '@cio/utils/errors';
import { type DbOrTxClient, db } from '@db/drizzle';

export type MessagingProfile = {
  profileId: string;
  roleId: number;
  isMinor: boolean;
  name: string;
  avatarUrl: string | null;
};

export type CohortRosterMember = MessagingProfile;

export type CohortRoster = {
  groupId: string;
  name: string;
  courseName: string;
  fellowDmEnabled: boolean;
  members: CohortRosterMember[];
};

export type CohortMessagingSettingRow = {
  groupId: string;
  name: string;
  fellowDmEnabled: boolean;
};

export type MessagingKeywordRow = {
  id: string;
  phrase: string;
  action: 'flag' | 'block';
  createdAt: string;
};

export type MessagingAuditAction = 'read' | 'export' | 'disclosure' | 'keyword_upsert' | 'keyword_delete';

export type MessagingAuditRow = {
  id: string;
  actorProfileId: string | null;
  action: string;
  channelType: string | null;
  channelId: string | null;
  metadata: unknown;
  createdAt: string;
};

function profileName(name: string | null, email: string | null): string {
  return name || email || '';
}

function keywordAction(value: string | undefined): 'flag' | 'block' | null {
  if (value === 'flag' || value === 'block') return value;

  return null;
}

async function selectProfiles(
  organizationId: string,
  filters: ReturnType<typeof eq>[],
  dbClient: DbOrTxClient
): Promise<MessagingProfile[]> {
  const rows = await dbClient
    .select({
      profileId: schema.organizationmember.profileId,
      roleId: schema.organizationmember.roleId,
      isMinor: schema.organizationMemberSafeguarding.isMinor,
      name: schema.profile.fullname,
      email: schema.profile.email,
      avatarUrl: schema.profile.avatarUrl
    })
    .from(schema.organizationmember)
    .leftJoin(schema.profile, eq(schema.profile.id, schema.organizationmember.profileId))
    .leftJoin(
      schema.organizationMemberSafeguarding,
      eq(schema.organizationMemberSafeguarding.organizationMemberId, schema.organizationmember.id)
    )
    .where(
      and(
        eq(schema.organizationmember.organizationId, organizationId),
        eq(schema.organizationmember.status, 'ACTIVE'),
        ...filters
      )
    );

  return rows.flatMap((row) => {
    if (!row.profileId) return [];

    return [
      {
        profileId: row.profileId,
        roleId: row.roleId,
        isMinor: row.isMinor ?? false,
        name: profileName(row.name, row.email),
        avatarUrl: row.avatarUrl
      }
    ];
  });
}

/** Active members of an organization, limited to the given profile ids. */
export async function listMessagingProfiles(
  organizationId: string,
  profileIds: string[],
  dbClient: DbOrTxClient = db
): Promise<MessagingProfile[]> {
  if (profileIds.length === 0) return [];

  try {
    return await selectProfiles(organizationId, [inArray(schema.organizationmember.profileId, profileIds)], dbClient);
  } catch (error) {
    console.error('listMessagingProfiles error:', error);
    throw new Error('Failed to load messaging profiles');
  }
}

function publishedCourseJoin() {
  return and(
    eq(schema.course.groupId, schema.group.id),
    eq(schema.course.isPublished, true),
    eq(schema.course.isTemplate, false)
  );
}

/** Groups that have a published, non-template course. */
export async function listPublishedMessagingGroupIds(
  organizationId: string,
  dbClient: DbOrTxClient = db
): Promise<string[]> {
  try {
    const rows = await dbClient
      .select({ groupId: schema.group.id })
      .from(schema.group)
      .innerJoin(schema.course, publishedCourseJoin())
      .where(eq(schema.group.organizationId, organizationId));

    return [...new Set(rows.map((row) => row.groupId))];
  } catch (error) {
    console.error('listPublishedMessagingGroupIds error:', error);
    throw new Error('Failed to load published cohorts');
  }
}

function safeguardingStaffIds(settings: unknown): string[] | null {
  if (!settings || typeof settings !== 'object' || !('safeguardingStaffIds' in settings)) return null;

  const value = settings.safeguardingStaffIds;

  if (!Array.isArray(value)) return null;

  return value.filter((id): id is string => typeof id === 'string');
}

/** `null` when the org has not chosen a safeguarding staff list. */
export async function readSafeguardingStaffIds(
  organizationId: string,
  dbClient: DbOrTxClient = db
): Promise<string[] | null> {
  try {
    const rows = await dbClient
      .select({ settings: schema.organization.settings })
      .from(schema.organization)
      .where(eq(schema.organization.id, organizationId))
      .limit(1);

    return safeguardingStaffIds(rows[0]?.settings);
  } catch (error) {
    console.error('readSafeguardingStaffIds error:', error);
    throw new Error('Failed to load safeguarding staff');
  }
}

/** `null` clears the list so direct messages fall back to every non-minor admin. */
export async function writeSafeguardingStaffIds(
  organizationId: string,
  staffIds: string[] | null,
  dbClient: DbOrTxClient = db
): Promise<void> {
  try {
    const rows = await dbClient
      .select({ settings: schema.organization.settings })
      .from(schema.organization)
      .where(eq(schema.organization.id, organizationId))
      .limit(1);
    const organization = rows[0];

    if (!organization) {
      throw new Error('Organization not found');
    }

    const next = { ...(organization.settings ?? {}) };

    if (staffIds === null) {
      delete next.safeguardingStaffIds;
    } else {
      next.safeguardingStaffIds = staffIds;
    }

    await dbClient
      .update(schema.organization)
      .set({ settings: next })
      .where(eq(schema.organization.id, organizationId));
  } catch (error) {
    console.error('writeSafeguardingStaffIds error:', error);
    throw new Error('Failed to save safeguarding staff');
  }
}

/** Active admins who can be placed in an adult–minor conversation. */
export async function listMessagingAdmins(
  organizationId: string,
  dbClient: DbOrTxClient = db
): Promise<MessagingProfile[]> {
  try {
    return await selectProfiles(organizationId, [eq(schema.organizationmember.roleId, ROLE.ADMIN)], dbClient);
  } catch (error) {
    console.error('listMessagingAdmins error:', error);
    throw new Error('Failed to load messaging staff');
  }
}

export async function mentorPairAssigned(
  organizationId: string,
  mentorProfileId: string,
  fellowProfileId: string,
  dbClient: DbOrTxClient = db
): Promise<boolean> {
  try {
    const rows = await dbClient
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

    return rows.length > 0;
  } catch (error) {
    console.error('mentorPairAssigned error:', error);
    throw new Error('Failed to check mentor assignment');
  }
}

/** Fellows assigned to one mentor. Used to offer mentor direct messages. */
export async function listAssignedFellows(
  organizationId: string,
  mentorProfileId: string,
  dbClient: DbOrTxClient = db
): Promise<MessagingProfile[]> {
  try {
    const rows = await dbClient
      .select({
        profileId: schema.mentorAssignment.fellowProfileId,
        roleId: schema.organizationmember.roleId,
        isMinor: schema.organizationMemberSafeguarding.isMinor,
        name: schema.profile.fullname,
        email: schema.profile.email,
        avatarUrl: schema.profile.avatarUrl
      })
      .from(schema.mentorAssignment)
      .innerJoin(
        schema.organizationmember,
        and(
          eq(schema.organizationmember.profileId, schema.mentorAssignment.fellowProfileId),
          eq(schema.organizationmember.organizationId, organizationId),
          eq(schema.organizationmember.status, 'ACTIVE')
        )
      )
      .leftJoin(schema.profile, eq(schema.profile.id, schema.mentorAssignment.fellowProfileId))
      .leftJoin(
        schema.organizationMemberSafeguarding,
        eq(schema.organizationMemberSafeguarding.organizationMemberId, schema.organizationmember.id)
      )
      .where(
        and(
          eq(schema.mentorAssignment.organizationId, organizationId),
          eq(schema.mentorAssignment.mentorProfileId, mentorProfileId)
        )
      );

    return rows.map((row) => ({
      profileId: row.profileId,
      roleId: row.roleId,
      isMinor: row.isMinor ?? false,
      name: profileName(row.name, row.email),
      avatarUrl: row.avatarUrl
    }));
  } catch (error) {
    console.error('listAssignedFellows error:', error);
    throw new Error('Failed to load assigned fellows');
  }
}

export async function listSharedMessagingCohorts(
  organizationId: string,
  profileA: string,
  profileB: string,
  dbClient: DbOrTxClient = db
): Promise<Array<{ groupId: string; fellowDmEnabled: boolean }>> {
  const mine = alias(schema.groupmember, 'messaging_member_a');
  const theirs = alias(schema.groupmember, 'messaging_member_b');

  try {
    const rows = await dbClient
      .select({
        groupId: schema.group.id,
        fellowDmEnabled: schema.messagingCohortSetting.fellowDmEnabled
      })
      .from(mine)
      .innerJoin(theirs, eq(theirs.groupId, mine.groupId))
      .innerJoin(schema.group, eq(schema.group.id, mine.groupId))
      .innerJoin(schema.course, publishedCourseJoin())
      .leftJoin(schema.messagingCohortSetting, eq(schema.messagingCohortSetting.groupId, schema.group.id))
      .where(
        and(
          eq(schema.group.organizationId, organizationId),
          eq(mine.profileId, profileA),
          eq(theirs.profileId, profileB)
        )
      );

    const seen = new Set<string>();

    return rows.flatMap((row) => {
      if (seen.has(row.groupId)) return [];

      seen.add(row.groupId);

      return [
        {
          groupId: row.groupId,
          fellowDmEnabled: row.fellowDmEnabled ?? false
        }
      ];
    });
  } catch (error) {
    console.error('listSharedMessagingCohorts error:', error);
    throw new Error('Failed to load shared cohorts');
  }
}

async function cohortRows(organizationId: string, profileId: string | null, dbClient: DbOrTxClient) {
  const filters = [eq(schema.group.organizationId, organizationId)];

  if (profileId) {
    filters.push(eq(schema.groupmember.profileId, profileId));
  }

  const query = dbClient
    .select({
      groupId: schema.group.id,
      name: schema.group.name,
      courseTitle: schema.course.title,
      fellowDmEnabled: schema.messagingCohortSetting.fellowDmEnabled
    })
    .from(schema.group)
    .innerJoin(schema.course, publishedCourseJoin())
    .leftJoin(schema.messagingCohortSetting, eq(schema.messagingCohortSetting.groupId, schema.group.id));

  if (profileId) {
    return query.innerJoin(schema.groupmember, eq(schema.groupmember.groupId, schema.group.id)).where(and(...filters));
  }

  return query.where(and(...filters));
}

/** Cohorts in the org. When `profileId` is set, only cohorts that person belongs to. */
export async function listCohortRosters(
  organizationId: string,
  profileId: string | null,
  dbClient: DbOrTxClient = db
): Promise<CohortRoster[]> {
  try {
    const cohorts = await cohortRows(organizationId, profileId, dbClient);
    const groupIds = [...new Set(cohorts.map((cohort) => cohort.groupId))];

    if (groupIds.length === 0) return [];

    const members = await dbClient
      .select({
        groupId: schema.groupmember.groupId,
        profileId: schema.groupmember.profileId,
        roleId: schema.organizationmember.roleId,
        isMinor: schema.organizationMemberSafeguarding.isMinor,
        name: schema.profile.fullname,
        email: schema.profile.email,
        avatarUrl: schema.profile.avatarUrl
      })
      .from(schema.groupmember)
      .innerJoin(
        schema.organizationmember,
        and(
          eq(schema.organizationmember.profileId, schema.groupmember.profileId),
          eq(schema.organizationmember.organizationId, organizationId),
          eq(schema.organizationmember.status, 'ACTIVE')
        )
      )
      .leftJoin(schema.profile, eq(schema.profile.id, schema.groupmember.profileId))
      .leftJoin(
        schema.organizationMemberSafeguarding,
        eq(schema.organizationMemberSafeguarding.organizationMemberId, schema.organizationmember.id)
      )
      .where(inArray(schema.groupmember.groupId, groupIds));

    const membersByGroup = new Map<string, CohortRosterMember[]>();

    for (const member of members) {
      if (!member.profileId) continue;

      const list = membersByGroup.get(member.groupId) ?? [];
      list.push({
        profileId: member.profileId,
        roleId: member.roleId,
        isMinor: member.isMinor ?? false,
        name: profileName(member.name, member.email),
        avatarUrl: member.avatarUrl
      });
      membersByGroup.set(member.groupId, list);
    }

    const seen = new Set<string>();
    const titlesByGroup = new Map<string, Set<string>>();

    for (const cohort of cohorts) {
      const titles = titlesByGroup.get(cohort.groupId) ?? new Set<string>();
      const title = cohort.courseTitle?.trim();

      if (title) titles.add(title);

      titlesByGroup.set(cohort.groupId, titles);
    }

    return cohorts.flatMap((cohort) => {
      if (seen.has(cohort.groupId)) return [];

      seen.add(cohort.groupId);

      const courseName = [...(titlesByGroup.get(cohort.groupId) ?? [])]
        .sort((left, right) => left.localeCompare(right))
        .join(', ');

      return [
        {
          groupId: cohort.groupId,
          name: cohort.name,
          courseName: courseName || cohort.name,
          fellowDmEnabled: cohort.fellowDmEnabled ?? false,
          members: membersByGroup.get(cohort.groupId) ?? []
        }
      ];
    });
  } catch (error) {
    console.error('listCohortRosters error:', error);
    throw new Error('Failed to load cohort messaging rosters');
  }
}

export async function listCohortMessagingSettings(
  organizationId: string,
  dbClient: DbOrTxClient = db
): Promise<CohortMessagingSettingRow[]> {
  try {
    const rows = await dbClient
      .select({
        groupId: schema.group.id,
        name: schema.group.name,
        fellowDmEnabled: schema.messagingCohortSetting.fellowDmEnabled
      })
      .from(schema.group)
      .leftJoin(schema.messagingCohortSetting, eq(schema.messagingCohortSetting.groupId, schema.group.id))
      .where(eq(schema.group.organizationId, organizationId));

    return rows.map((row) => ({
      groupId: row.groupId,
      name: row.name,
      fellowDmEnabled: row.fellowDmEnabled ?? false
    }));
  } catch (error) {
    console.error('listCohortMessagingSettings error:', error);
    throw new Error('Failed to load cohort messaging settings');
  }
}

export async function upsertCohortMessagingSetting(
  organizationId: string,
  groupId: string,
  fellowDmEnabled: boolean,
  updatedBy: string,
  dbClient: DbOrTxClient = db
): Promise<CohortMessagingSettingRow | null> {
  try {
    const groups = await dbClient
      .select({ id: schema.group.id, name: schema.group.name })
      .from(schema.group)
      .where(and(eq(schema.group.id, groupId), eq(schema.group.organizationId, organizationId)))
      .limit(1);
    const cohort = groups[0];

    if (!cohort) return null;

    await dbClient
      .insert(schema.messagingCohortSetting)
      .values({
        groupId,
        organizationId,
        fellowDmEnabled,
        updatedBy
      })
      .onConflictDoUpdate({
        target: schema.messagingCohortSetting.groupId,
        set: {
          fellowDmEnabled,
          updatedBy,
          updatedAt: sql`timezone('utc'::text, now())`
        }
      });

    return { groupId, name: cohort.name, fellowDmEnabled };
  } catch (error) {
    console.error('upsertCohortMessagingSetting error:', error);
    throw new Error('Failed to save cohort messaging setting');
  }
}

export async function listMessagingKeywords(
  organizationId: string,
  dbClient: DbOrTxClient = db
): Promise<MessagingKeywordRow[]> {
  try {
    const rows = await dbClient
      .select({
        id: schema.messagingKeyword.id,
        phrase: schema.messagingKeyword.phrase,
        action: schema.messagingKeyword.action,
        createdAt: schema.messagingKeyword.createdAt
      })
      .from(schema.messagingKeyword)
      .where(eq(schema.messagingKeyword.organizationId, organizationId))
      .orderBy(schema.messagingKeyword.phrase);

    return rows.flatMap((row) => {
      if (row.action !== 'flag' && row.action !== 'block') return [];

      return [{ id: row.id, phrase: row.phrase, action: row.action, createdAt: row.createdAt }];
    });
  } catch (error) {
    console.error('listMessagingKeywords error:', error);
    throw new Error('Failed to list messaging keywords');
  }
}

export async function createMessagingKeyword(
  input: { organizationId: string; phrase: string; action: 'flag' | 'block'; createdBy: string },
  dbClient?: DbOrTxClient
): Promise<MessagingKeywordRow | 'duplicate'> {
  const write = async (client: DbOrTxClient) => {
    const [row] = await client
      .insert(schema.messagingKeyword)
      .values({
        organizationId: input.organizationId,
        phrase: input.phrase,
        action: input.action,
        createdBy: input.createdBy
      })
      .returning({
        id: schema.messagingKeyword.id,
        phrase: schema.messagingKeyword.phrase,
        action: schema.messagingKeyword.action,
        createdAt: schema.messagingKeyword.createdAt
      });

    const action = keywordAction(row?.action);

    if (!row || !action) {
      throw new Error('Failed to create messaging keyword');
    }

    await client.insert(schema.messagingAudit).values({
      organizationId: input.organizationId,
      actorProfileId: input.createdBy,
      action: 'keyword_upsert',
      metadata: { keywordId: row.id, action }
    });

    return { id: row.id, phrase: row.phrase, action, createdAt: row.createdAt };
  };

  try {
    if (dbClient) return await write(dbClient);

    return await db.transaction(write);
  } catch (error) {
    if (isUniqueConstraintViolation(error)) return 'duplicate';

    console.error('createMessagingKeyword error:', error);
    throw new Error('Failed to create messaging keyword');
  }
}

export async function deleteMessagingKeyword(
  organizationId: string,
  keywordId: string,
  actorProfileId: string,
  dbClient?: DbOrTxClient
): Promise<boolean> {
  const write = async (client: DbOrTxClient) => {
    const deleted = await client
      .delete(schema.messagingKeyword)
      .where(and(eq(schema.messagingKeyword.id, keywordId), eq(schema.messagingKeyword.organizationId, organizationId)))
      .returning({ id: schema.messagingKeyword.id });

    if (deleted.length === 0) return false;

    await client.insert(schema.messagingAudit).values({
      organizationId,
      actorProfileId,
      action: 'keyword_delete',
      metadata: { keywordId }
    });

    return true;
  };

  try {
    if (dbClient) return await write(dbClient);

    return await db.transaction(write);
  } catch (error) {
    console.error('deleteMessagingKeyword error:', error);
    throw new Error('Failed to delete messaging keyword');
  }
}

export async function hasMessagingDisclosure(
  organizationId: string,
  profileId: string,
  dbClient: DbOrTxClient = db
): Promise<boolean> {
  try {
    const rows = await dbClient
      .select({ profileId: schema.messagingDisclosure.profileId })
      .from(schema.messagingDisclosure)
      .where(
        and(
          eq(schema.messagingDisclosure.organizationId, organizationId),
          eq(schema.messagingDisclosure.profileId, profileId)
        )
      )
      .limit(1);

    return rows.length > 0;
  } catch (error) {
    console.error('hasMessagingDisclosure error:', error);
    throw new Error('Failed to load messaging disclosure');
  }
}

/** Records that the member accepted the staff-visibility notice. A repeat accept does not add another audit row. */
export async function acceptMessagingDisclosure(
  organizationId: string,
  profileId: string,
  dbClient?: DbOrTxClient
): Promise<{ acceptedAt: string }> {
  const write = async (client: DbOrTxClient) => {
    const existing = await client
      .select({ acceptedAt: schema.messagingDisclosure.acceptedAt })
      .from(schema.messagingDisclosure)
      .where(
        and(
          eq(schema.messagingDisclosure.organizationId, organizationId),
          eq(schema.messagingDisclosure.profileId, profileId)
        )
      )
      .limit(1);

    if (existing[0]) return { acceptedAt: existing[0].acceptedAt };

    const inserted = await client
      .insert(schema.messagingDisclosure)
      .values({ organizationId, profileId })
      .onConflictDoNothing()
      .returning({ acceptedAt: schema.messagingDisclosure.acceptedAt });
    const row = inserted[0];

    if (!row) {
      const again = await client
        .select({ acceptedAt: schema.messagingDisclosure.acceptedAt })
        .from(schema.messagingDisclosure)
        .where(
          and(
            eq(schema.messagingDisclosure.organizationId, organizationId),
            eq(schema.messagingDisclosure.profileId, profileId)
          )
        )
        .limit(1);

      if (!again[0]) throw new Error('Failed to record messaging disclosure');

      return { acceptedAt: again[0].acceptedAt };
    }

    await client.insert(schema.messagingAudit).values({
      organizationId,
      actorProfileId: profileId,
      action: 'disclosure',
      metadata: {}
    });

    return { acceptedAt: row.acceptedAt };
  };

  try {
    if (dbClient) return await write(dbClient);

    return await db.transaction(write);
  } catch (error) {
    console.error('acceptMessagingDisclosure error:', error);
    throw new Error('Failed to record messaging disclosure');
  }
}

export async function recordMessagingAudit(
  input: {
    organizationId: string;
    actorProfileId: string;
    action: 'read' | 'export';
    channelType: string;
    channelId: string;
    metadata: Record<string, string | number>;
  },
  dbClient: DbOrTxClient = db
): Promise<void> {
  try {
    await dbClient.insert(schema.messagingAudit).values({
      organizationId: input.organizationId,
      actorProfileId: input.actorProfileId,
      action: input.action,
      channelType: input.channelType,
      channelId: input.channelId,
      metadata: input.metadata
    });
  } catch (error) {
    console.error('recordMessagingAudit error:', error);
    throw new Error('Failed to record messaging audit');
  }
}

export async function listRecentMessagingAudits(
  organizationId: string,
  dbClient: DbOrTxClient = db
): Promise<MessagingAuditRow[]> {
  try {
    return await dbClient
      .select({
        id: schema.messagingAudit.id,
        actorProfileId: schema.messagingAudit.actorProfileId,
        action: schema.messagingAudit.action,
        channelType: schema.messagingAudit.channelType,
        channelId: schema.messagingAudit.channelId,
        metadata: schema.messagingAudit.metadata,
        createdAt: schema.messagingAudit.createdAt
      })
      .from(schema.messagingAudit)
      .where(eq(schema.messagingAudit.organizationId, organizationId))
      .orderBy(desc(schema.messagingAudit.createdAt))
      .limit(20);
  } catch (error) {
    console.error('listRecentMessagingAudits error:', error);
    throw new Error('Failed to list messaging audit');
  }
}

export async function createMessagingFlag(
  input: {
    organizationId: string;
    channelType: string;
    channelId: string;
    messageId: string;
    reporterProfileId: string | null;
    reason: string | null;
  },
  dbClient: DbOrTxClient = db
): Promise<{ id: string }> {
  try {
    const [row] = await dbClient.insert(schema.messagingFlag).values(input).returning({ id: schema.messagingFlag.id });

    if (!row) throw new Error('Failed to flag message');

    return row;
  } catch (error) {
    console.error('createMessagingFlag error:', error);
    throw new Error('Failed to flag message');
  }
}

export async function countMessagingFlags(
  organizationId: string,
  dbClient: DbOrTxClient = db
): Promise<Array<{ channelType: string; channelId: string; count: number }>> {
  try {
    const rows = await dbClient
      .select({
        channelType: schema.messagingFlag.channelType,
        channelId: schema.messagingFlag.channelId,
        count: sql<number>`count(*)::int`
      })
      .from(schema.messagingFlag)
      .where(eq(schema.messagingFlag.organizationId, organizationId))
      .groupBy(schema.messagingFlag.channelType, schema.messagingFlag.channelId);

    return rows;
  } catch (error) {
    console.error('countMessagingFlags error:', error);
    throw new Error('Failed to count messaging flags');
  }
}

export async function muteMessagingUser(
  organizationId: string,
  muterProfileId: string,
  mutedProfileId: string,
  dbClient: DbOrTxClient = db
): Promise<void> {
  try {
    await dbClient
      .insert(schema.messagingMute)
      .values({ organizationId, muterProfileId, mutedProfileId })
      .onConflictDoNothing();
  } catch (error) {
    console.error('muteMessagingUser error:', error);
    throw new Error('Failed to mute user');
  }
}

export async function unmuteMessagingUser(
  organizationId: string,
  muterProfileId: string,
  mutedProfileId: string,
  dbClient: DbOrTxClient = db
): Promise<void> {
  try {
    await dbClient
      .delete(schema.messagingMute)
      .where(
        and(
          eq(schema.messagingMute.organizationId, organizationId),
          eq(schema.messagingMute.muterProfileId, muterProfileId),
          eq(schema.messagingMute.mutedProfileId, mutedProfileId)
        )
      );
  } catch (error) {
    console.error('unmuteMessagingUser error:', error);
    throw new Error('Failed to unmute user');
  }
}
