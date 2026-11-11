import { AppError, ErrorCodes } from '@api/utils/errors';
import { db } from '@cio/db/drizzle';
import { listMentorRoster, replaceMentorFellows } from '@cio/db/queries/organization/mentor-assignment';
import { listActiveStudents } from '@cio/db/queries/organization/safeguarding';
import { getOrganizationMemberRoleId } from '@cio/db/queries/organization/organization';
import { ROLE } from '@cio/utils/constants';

import type { PaceViewer } from './fellow-pace';

/**
 * Admins see every tutor and every active fellow. A tutor sees only their own assignments
 * and not the rest of the roster.
 */
export async function getMentorRoster(organizationId: string, viewer: PaceViewer) {
  if (viewer.roleId === ROLE.ADMIN) {
    const mentors = await listMentorRoster(organizationId, null);
    const fellows = await listActiveStudents(organizationId);

    return { mentors, fellows };
  }

  if (viewer.roleId === ROLE.TUTOR) {
    const mentors = await listMentorRoster(organizationId, viewer.profileId);

    return { mentors, fellows: mentors.flatMap((mentor) => mentor.fellows) };
  }

  throw new AppError(
    'Only organization team members can view mentor assignments',
    ErrorCodes.ORG_TEAM_NOT_AUTHORIZED,
    403
  );
}

/**
 * Replaces the fellows assigned to one tutor. Only an organization admin can assign mentors.
 */
export async function setMentorFellows(
  organizationId: string,
  mentorProfileId: string,
  fellowProfileIds: string[],
  actor: PaceViewer
) {
  return db.transaction(async (tx) => {
    const roleId = await getOrganizationMemberRoleId(organizationId, actor.profileId, tx);

    if (roleId !== ROLE.ADMIN) {
      throw new AppError('Only organization admins can assign mentors', ErrorCodes.ORG_TEAM_NOT_AUTHORIZED, 403);
    }

    const result = await replaceMentorFellows(
      {
        organizationId,
        mentorProfileId,
        fellowProfileIds,
        assignedBy: actor.profileId
      },
      tx
    );

    if (!result.mentorFound) {
      throw new AppError('Mentor must be an active tutor', ErrorCodes.MENTOR_NOT_TUTOR, 400);
    }

    if (result.missingFellowIds.length > 0) {
      throw new AppError('Each fellow must be an active student', ErrorCodes.MENTOR_FELLOW_NOT_STUDENT, 400);
    }

    const mentors = await listMentorRoster(organizationId, mentorProfileId, tx);

    return mentors[0] ?? null;
  });
}
