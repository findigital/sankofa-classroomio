import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ROLE } from '@cio/utils/constants';

const mocks = vi.hoisted(() => ({
  listMentorRoster: vi.fn(),
  replaceMentorFellows: vi.fn(),
  listActiveStudents: vi.fn()
}));

vi.mock('@cio/db/drizzle', () => ({
  db: { transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({})) }
}));

vi.mock('@cio/db/queries/organization/mentor-assignment', () => ({
  listMentorRoster: mocks.listMentorRoster,
  replaceMentorFellows: mocks.replaceMentorFellows
}));

vi.mock('@cio/db/queries/organization/safeguarding', () => ({
  listActiveStudents: mocks.listActiveStudents
}));

vi.mock('@cio/db/queries/organization/organization', () => ({
  getOrganizationMemberRoleId: vi.fn()
}));

import { getMentorRoster } from './mentor-assignment';

const ORG_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const MENTOR_ID = '11111111-1111-4111-8111-111111111111';

describe('getMentorRoster', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns only the tutor and their assigned fellows', async () => {
    const assigned = { profileId: 'fellow-a', memberId: 4, name: 'Assigned', email: 'assigned@example.com' };
    mocks.listMentorRoster.mockResolvedValue([
      { mentorProfileId: MENTOR_ID, mentorName: 'Mentor', mentorEmail: 'mentor@example.com', fellows: [assigned] }
    ]);

    const result = await getMentorRoster(ORG_ID, { profileId: MENTOR_ID, roleId: ROLE.TUTOR });

    expect(mocks.listMentorRoster).toHaveBeenCalledWith(ORG_ID, MENTOR_ID);
    expect(mocks.listActiveStudents).not.toHaveBeenCalled();
    expect(result.fellows).toEqual([assigned]);
    expect(result.mentors).toHaveLength(1);
  });
});
