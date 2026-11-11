import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ROLE } from '@cio/utils/constants';
import { ErrorCodes } from '@cio/utils/errors';
import { EMPTY_SAFEGUARDING } from '@cio/utils/validation/organization';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  getActiveOrgMemberById: vi.fn(),
  getSafeguardingSnapshot: vi.fn(),
  isMentorOfFellow: vi.fn(),
  listSafeguardingAudit: vi.fn(),
  writeSafeguarding: vi.fn(),
  getOrganizationMemberRoleId: vi.fn()
}));

vi.mock('@cio/db/drizzle', () => ({
  db: { transaction: mocks.transaction }
}));

vi.mock('@cio/db/queries/organization/safeguarding', () => ({
  getActiveOrgMemberById: mocks.getActiveOrgMemberById,
  getSafeguardingSnapshot: mocks.getSafeguardingSnapshot,
  isMentorOfFellow: mocks.isMentorOfFellow,
  listSafeguardingAudit: mocks.listSafeguardingAudit,
  writeSafeguarding: mocks.writeSafeguarding
}));

vi.mock('@cio/db/queries/organization/organization', () => ({
  getOrganizationMemberRoleId: mocks.getOrganizationMemberRoleId
}));

import { readMinorFlag, readSafeguarding, updateSafeguarding } from './safeguarding';

const ORG_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const MENTOR_ID = '11111111-1111-4111-8111-111111111111';
const FELLOW_ID = '22222222-2222-4222-8222-222222222222';
const MEMBER_ID = 12;

const member = {
  id: MEMBER_ID,
  profileId: FELLOW_ID,
  email: 'fellow@example.com',
  roleId: ROLE.STUDENT
};

const secretRecord = {
  ...EMPTY_SAFEGUARDING,
  isMinor: true,
  guardianEmail: 'secret@example.com',
  guardianName: 'Secret Guardian',
  notes: 'private note'
};

describe('safeguarding reads and writes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({}));
    mocks.getActiveOrgMemberById.mockResolvedValue(member);
    mocks.getSafeguardingSnapshot.mockResolvedValue(secretRecord);
    mocks.isMentorOfFellow.mockResolvedValue(false);
    mocks.listSafeguardingAudit.mockResolvedValue([]);
    mocks.getOrganizationMemberRoleId.mockResolvedValue(ROLE.ADMIN);
    mocks.writeSafeguarding.mockResolvedValue(secretRecord);
  });

  it('does not load the record for a student', async () => {
    await expect(
      readMinorFlag(ORG_ID, MEMBER_ID, { profileId: 'student', roleId: ROLE.STUDENT })
    ).rejects.toMatchObject({ code: ErrorCodes.ORG_TEAM_NOT_AUTHORIZED, statusCode: 403 });
    await expect(
      readSafeguarding(ORG_ID, MEMBER_ID, { profileId: 'student', roleId: ROLE.STUDENT })
    ).rejects.toMatchObject({ code: ErrorCodes.ORG_TEAM_NOT_AUTHORIZED, statusCode: 403 });

    expect(mocks.getSafeguardingSnapshot).not.toHaveBeenCalled();
  });

  it('does not load the record for a tutor who is not assigned to the fellow', async () => {
    await expect(readMinorFlag(ORG_ID, MEMBER_ID, { profileId: MENTOR_ID, roleId: ROLE.TUTOR })).rejects.toMatchObject({
      code: ErrorCodes.ORG_TEAM_NOT_AUTHORIZED,
      statusCode: 403
    });

    expect(mocks.isMentorOfFellow).toHaveBeenCalledWith(ORG_ID, MENTOR_ID, FELLOW_ID);
    expect(mocks.getSafeguardingSnapshot).not.toHaveBeenCalled();
  });

  it('returns only the minor flag to an assigned mentor', async () => {
    mocks.isMentorOfFellow.mockResolvedValue(true);

    const result = await readMinorFlag(ORG_ID, MEMBER_ID, { profileId: MENTOR_ID, roleId: ROLE.TUTOR });

    expect(result).toEqual({ isMinor: true });
    expect(Object.keys(result)).toEqual(['isMinor']);
    expect(JSON.stringify(result)).not.toContain('secret@example.com');
  });

  it('does not write when a tutor tries to edit consent', async () => {
    mocks.getOrganizationMemberRoleId.mockResolvedValue(ROLE.TUTOR);

    await expect(
      updateSafeguarding(ORG_ID, MEMBER_ID, { profileId: MENTOR_ID, roleId: ROLE.TUTOR }, EMPTY_SAFEGUARDING)
    ).rejects.toMatchObject({ code: ErrorCodes.ORG_TEAM_NOT_AUTHORIZED, statusCode: 403 });

    expect(mocks.writeSafeguarding).not.toHaveBeenCalled();
  });

  it('lets an admin write the record', async () => {
    await updateSafeguarding(ORG_ID, MEMBER_ID, { profileId: 'admin', roleId: ROLE.ADMIN }, EMPTY_SAFEGUARDING);

    expect(mocks.writeSafeguarding).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_ID, actorProfileId: 'admin', next: EMPTY_SAFEGUARDING }),
      expect.anything()
    );
  });
});
