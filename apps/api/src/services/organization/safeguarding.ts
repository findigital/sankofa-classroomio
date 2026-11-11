import { AppError, ErrorCodes } from '@api/utils/errors';
import { db } from '@cio/db/drizzle';
import { getOrganizationMemberRoleId } from '@cio/db/queries/organization/organization';
import {
  getActiveOrgMemberById,
  getSafeguardingSnapshot,
  isMentorOfFellow,
  listSafeguardingAudit,
  writeSafeguarding,
  type SafeguardingAuditEntry
} from '@cio/db/queries/organization/safeguarding';
import { ROLE } from '@cio/utils/constants';
import { safeguardingAccess } from '@cio/utils/functions/fellow-pace';
import {
  toMinorSafeguarding,
  type SafeguardingSnapshot,
  type TUpdateSafeguarding
} from '@cio/utils/validation/organization';

import type { PaceViewer } from './fellow-pace';

/**
 * Full safeguarding record and its audit. Organization admins only.
 * A missing member is a 404; every other role is a 403 before the record is loaded.
 */
export async function readSafeguarding(
  organizationId: string,
  memberId: number,
  viewer: PaceViewer
): Promise<{ record: SafeguardingSnapshot; audit: SafeguardingAuditEntry[] }> {
  if (safeguardingAccess(viewer.roleId, false) !== 'full') {
    throw new AppError('You cannot view this safeguarding record', ErrorCodes.ORG_TEAM_NOT_AUTHORIZED, 403);
  }

  const member = await getActiveOrgMemberById(organizationId, memberId);

  if (!member) {
    throw new AppError('Member not found', ErrorCodes.FELLOW_NOT_FOUND, 404);
  }

  const record = await getSafeguardingSnapshot(member.id);
  const audit = await listSafeguardingAudit(organizationId, member.id);

  return { record, audit };
}

/**
 * The under-18 flag only. Admins and the fellow's assigned mentor may read it.
 * Unassigned staff and students are denied before the record is loaded.
 */
export async function readMinorFlag(
  organizationId: string,
  memberId: number,
  viewer: PaceViewer
): Promise<{ isMinor: boolean }> {
  const member = await getActiveOrgMemberById(organizationId, memberId);

  if (!member) {
    if (viewer.roleId !== ROLE.ADMIN) {
      throw new AppError('You cannot view this fellow', ErrorCodes.ORG_TEAM_NOT_AUTHORIZED, 403);
    }

    throw new AppError('Member not found', ErrorCodes.FELLOW_NOT_FOUND, 404);
  }

  const assigned =
    viewer.roleId === ROLE.TUTOR && member.profileId
      ? await isMentorOfFellow(organizationId, viewer.profileId, member.profileId)
      : false;

  if (safeguardingAccess(viewer.roleId, assigned) === 'deny') {
    throw new AppError('You cannot view this fellow', ErrorCodes.ORG_TEAM_NOT_AUTHORIZED, 403);
  }

  const record = await getSafeguardingSnapshot(member.id);

  return toMinorSafeguarding(record);
}

/**
 * Replaces a member's safeguarding record. Only an active organization admin can write,
 * and a change appends an audit row in the same transaction.
 */
export async function updateSafeguarding(
  organizationId: string,
  memberId: number,
  actor: PaceViewer,
  next: TUpdateSafeguarding
): Promise<SafeguardingSnapshot> {
  return db.transaction(async (tx) => {
    const roleId = await getOrganizationMemberRoleId(organizationId, actor.profileId, tx);

    if (roleId !== ROLE.ADMIN) {
      throw new AppError(
        'Only organization admins can edit safeguarding records',
        ErrorCodes.ORG_TEAM_NOT_AUTHORIZED,
        403
      );
    }

    const member = await getActiveOrgMemberById(organizationId, memberId, tx);

    if (!member) {
      throw new AppError('Member not found', ErrorCodes.FELLOW_NOT_FOUND, 404);
    }

    return writeSafeguarding(
      {
        organizationId,
        member,
        actorProfileId: actor.profileId,
        next
      },
      tx
    );
  });
}
