import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getOrganizationById: vi.fn(),
  listPublishedCourseGroupsForAutoEnroll: vi.fn(),
  listActiveOrgStudentsForAutoEnroll: vi.fn(),
  listStartedCourseIdsForProfile: vi.fn(),
  removeUnpublishedStudentMembershipsWithoutProgress: vi.fn(),
  enrollUsersInCourseGroups: vi.fn(),
  ensureComplianceEnrollmentRecordsForProfiles: vi.fn()
}));

vi.mock('@cio/db/queries/organization', () => ({
  getOrganizationById: mocks.getOrganizationById
}));

vi.mock('@cio/db/queries/course', () => ({
  listPublishedCourseGroupsForAutoEnroll: mocks.listPublishedCourseGroupsForAutoEnroll,
  listActiveOrgStudentsForAutoEnroll: mocks.listActiveOrgStudentsForAutoEnroll,
  listStartedCourseIdsForProfile: mocks.listStartedCourseIdsForProfile,
  removeUnpublishedStudentMembershipsWithoutProgress: mocks.removeUnpublishedStudentMembershipsWithoutProgress
}));

vi.mock('@cio/db/queries/group', () => ({
  enrollUsersInCourseGroups: mocks.enrollUsersInCourseGroups
}));

vi.mock('@api/services/course/compliance', () => ({
  ensureComplianceEnrollmentRecordsForProfiles: mocks.ensureComplianceEnrollmentRecordsForProfiles
}));

import { autoEnrollOrgStudents } from '@api/services/course/member-auto-enroll';

const orgId = 'org-1';

describe('autoEnrollOrgStudents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrganizationById.mockResolvedValue({ settings: { membersOnlyCatalog: true } });
    mocks.removeUnpublishedStudentMembershipsWithoutProgress.mockResolvedValue(0);
    mocks.listPublishedCourseGroupsForAutoEnroll.mockResolvedValue([
      { courseId: 'course-1', groupId: 'group-1', isPublished: true }
    ]);
    mocks.listActiveOrgStudentsForAutoEnroll.mockResolvedValue([
      { profileId: 'student-1', email: 'student@example.com' }
    ]);
    mocks.ensureComplianceEnrollmentRecordsForProfiles.mockResolvedValue(undefined);
  });

  it('inserts missing student memberships once and inserts nothing on the next run', async () => {
    mocks.enrollUsersInCourseGroups
      .mockResolvedValueOnce([{ id: 'member-1', groupId: 'group-1', profileId: 'student-1', roleId: 3 }])
      .mockResolvedValueOnce([]);

    const first = await autoEnrollOrgStudents({ orgId });
    const second = await autoEnrollOrgStudents({ orgId });

    expect(first.inserted).toBe(1);
    expect(second.inserted).toBe(0);
    expect(mocks.enrollUsersInCourseGroups).toHaveBeenCalledTimes(2);
    expect(mocks.enrollUsersInCourseGroups).toHaveBeenNthCalledWith(
      1,
      ['group-1'],
      [{ profileId: 'student-1', email: 'student@example.com' }],
      3
    );
    expect(mocks.ensureComplianceEnrollmentRecordsForProfiles).toHaveBeenCalledTimes(1);
    expect(mocks.ensureComplianceEnrollmentRecordsForProfiles).toHaveBeenCalledWith(['course-1'], ['student-1']);
    expect(mocks.removeUnpublishedStudentMembershipsWithoutProgress).toHaveBeenCalledWith('org-1', undefined);
  });

  it('enrolls published courses only and reports unpublished memberships removed', async () => {
    mocks.listPublishedCourseGroupsForAutoEnroll.mockResolvedValue([
      { courseId: 'draft', groupId: 'group-draft', isPublished: false },
      { courseId: 'course-1', groupId: 'group-1', isPublished: true }
    ]);
    mocks.removeUnpublishedStudentMembershipsWithoutProgress.mockResolvedValue(2);
    mocks.enrollUsersInCourseGroups.mockResolvedValue([]);

    const result = await autoEnrollOrgStudents({ orgId });

    expect(result).toEqual({ inserted: 0, removed: 2 });
    expect(mocks.enrollUsersInCourseGroups).toHaveBeenCalledWith(
      ['group-1'],
      [{ profileId: 'student-1', email: 'student@example.com' }],
      3
    );
  });

  it('does not enroll anyone when the setting is off', async () => {
    mocks.getOrganizationById.mockResolvedValue({
      settings: { membersOnlyCatalog: true, autoEnrollMembers: false }
    });

    const result = await autoEnrollOrgStudents({ orgId });

    expect(result).toEqual({ inserted: 0, removed: 0 });
    expect(mocks.enrollUsersInCourseGroups).not.toHaveBeenCalled();
    expect(mocks.removeUnpublishedStudentMembershipsWithoutProgress).not.toHaveBeenCalled();
  });

  it('does not enroll anyone when the catalog is open and auto-enroll was not turned on', async () => {
    mocks.getOrganizationById.mockResolvedValue({ settings: {} });

    const result = await autoEnrollOrgStudents({ orgId });

    expect(result).toEqual({ inserted: 0, removed: 0 });
    expect(mocks.listPublishedCourseGroupsForAutoEnroll).not.toHaveBeenCalled();
    expect(mocks.removeUnpublishedStudentMembershipsWithoutProgress).not.toHaveBeenCalled();
  });
});
