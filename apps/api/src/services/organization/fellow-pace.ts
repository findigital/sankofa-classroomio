import { AppError, ErrorCodes } from '@api/utils/errors';
import { env } from '@cio/core/config/env';
import {
  cohortBelongsToOrg,
  cohortIncludesCourse,
  courseBelongsToOrg,
  listFellowPace,
  listPaceFilters,
  type FellowPaceFellow
} from '@cio/db/queries/organization/fellow-pace';
import { ROLE } from '@cio/utils/constants';
import { fellowsVisibleToViewer } from '@cio/utils/functions/fellow-pace';
import type { TFellowPaceQuery } from '@cio/utils/validation/organization';

export type PaceViewer = {
  profileId: string;
  roleId: number;
};

/**
 * Staff pace for one organization. Tutors receive only fellows assigned to them,
 * even when the query would otherwise include someone else.
 */
export async function getFellowPace(organizationId: string, viewer: PaceViewer, query: TFellowPaceQuery) {
  if (viewer.roleId !== ROLE.ADMIN && viewer.roleId !== ROLE.TUTOR) {
    throw new AppError('Only organization team members can view fellow pace', ErrorCodes.ORG_TEAM_NOT_AUTHORIZED, 403);
  }

  if (query.courseId) {
    const courseInOrg = await courseBelongsToOrg(organizationId, query.courseId);

    if (!courseInOrg) {
      throw new AppError('Course not found', ErrorCodes.FELLOW_SCOPE_NOT_FOUND, 404);
    }
  }

  if (query.cohortId) {
    const cohortInOrg = await cohortBelongsToOrg(organizationId, query.cohortId);

    if (!cohortInOrg) {
      throw new AppError('Cohort not found', ErrorCodes.FELLOW_SCOPE_NOT_FOUND, 404);
    }
  }

  if (query.courseId && query.cohortId) {
    const linked = await cohortIncludesCourse(query.cohortId, query.courseId);

    if (!linked) {
      throw new AppError('Course is not in this cohort', ErrorCodes.FELLOW_SCOPE_MISMATCH, 400);
    }
  }

  const quietDays = query.quietDays ?? env.FELLOW_QUIET_DAYS;
  const mentorProfileId = viewer.roleId === ROLE.TUTOR ? viewer.profileId : null;
  const rows = await listFellowPace({
    organizationId,
    courseId: query.courseId ?? null,
    cohortId: query.cohortId ?? null,
    mentorProfileId,
    quietDays
  });
  const fellows: FellowPaceFellow[] = fellowsVisibleToViewer(rows, viewer);
  const filters = await listPaceFilters(organizationId);

  return { quietDays, fellows, courses: filters.courses, cohorts: filters.cohorts };
}
