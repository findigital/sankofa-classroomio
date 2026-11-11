import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ROLE } from '@cio/utils/constants';
import { ErrorCodes } from '@cio/utils/errors';

const mocks = vi.hoisted(() => ({
  listFellowPace: vi.fn(),
  listPaceFilters: vi.fn(),
  publishedCourseBelongsToOrg: vi.fn(),
  cohortBelongsToOrg: vi.fn(),
  cohortIncludesCourse: vi.fn()
}));

vi.mock('@cio/db/queries/organization/fellow-pace', () => mocks);

import { getFellowPace } from './fellow-pace';

const ORG_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const MENTOR_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_MENTOR_ID = '99999999-9999-4999-8999-999999999999';

function fellow(profileId: string, mentorProfileId: string) {
  return {
    memberId: 1,
    profileId,
    name: profileId,
    email: `${profileId}@example.com`,
    isMinor: false,
    lastActivityAt: '2026-06-01T00:00:00.000Z',
    lessonsCompleted: 1,
    lessonsRequired: 1,
    exercisesCompleted: 1,
    exercisesRequired: 1,
    overdueCount: 0,
    overdueItems: [],
    mentors: [{ profileId: mentorProfileId, name: 'Mentor' }],
    flags: [],
    pace: 'on_pace' as const
  };
}

describe('getFellowPace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.publishedCourseBelongsToOrg.mockResolvedValue(true);
    mocks.cohortBelongsToOrg.mockResolvedValue(true);
    mocks.cohortIncludesCourse.mockResolvedValue(true);
    mocks.listPaceFilters.mockResolvedValue({ courses: [], cohorts: [] });
  });

  it('asks for the tutor filter and still drops an unassigned fellow the query returned', async () => {
    const assigned = fellow('fellow-a', MENTOR_ID);
    const unassigned = fellow('fellow-b', OTHER_MENTOR_ID);
    mocks.listFellowPace.mockResolvedValue([assigned, unassigned]);

    const result = await getFellowPace(ORG_ID, { profileId: MENTOR_ID, roleId: ROLE.TUTOR }, {});

    expect(mocks.listFellowPace).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_ID, mentorProfileId: MENTOR_ID })
    );
    expect(result.fellows).toEqual([{ ...assigned, email: null }]);
    expect(result.fellows.some((row) => row.profileId === 'fellow-b')).toBe(false);
    expect(result.fellows.every((row) => row.email == null)).toBe(true);
  });

  it('does not filter an admin by mentor', async () => {
    const assigned = fellow('fellow-a', MENTOR_ID);
    const unassigned = fellow('fellow-b', OTHER_MENTOR_ID);
    mocks.listFellowPace.mockResolvedValue([assigned, unassigned]);

    const result = await getFellowPace(ORG_ID, { profileId: 'admin', roleId: ROLE.ADMIN }, {});

    expect(mocks.listFellowPace).toHaveBeenCalledWith(expect.objectContaining({ mentorProfileId: null }));
    expect(result.fellows).toEqual([assigned, unassigned]);
    expect(result.fellows[0]?.email).toBe(assigned.email);
  });

  it('rejects a course that is not published', async () => {
    mocks.publishedCourseBelongsToOrg.mockResolvedValue(false);

    await expect(
      getFellowPace(ORG_ID, { profileId: MENTOR_ID, roleId: ROLE.TUTOR }, { courseId: 'draft-course' })
    ).rejects.toMatchObject({
      code: ErrorCodes.FELLOW_SCOPE_NOT_FOUND,
      statusCode: 404
    });

    expect(mocks.listFellowPace).not.toHaveBeenCalled();
  });

  it('rejects a student before querying', async () => {
    await expect(getFellowPace(ORG_ID, { profileId: 'student', roleId: ROLE.STUDENT }, {})).rejects.toMatchObject({
      code: ErrorCodes.ORG_TEAM_NOT_AUTHORIZED,
      statusCode: 403
    });

    expect(mocks.listFellowPace).not.toHaveBeenCalled();
    expect(mocks.listPaceFilters).not.toHaveBeenCalled();
  });
});
