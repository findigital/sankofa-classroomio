import { describe, expect, it } from 'vitest';

import { ROLE } from '@cio/utils/constants';
import { courseViewerRoleId, isCourseStaffViewer } from './course-staff-access';

const studentId = 'student-1';
const tutorId = 'tutor-1';

describe('course staff access', () => {
  it('locks a fellow out of staff pages and lets tutors and org admins in', () => {
    const members = [
      { profileId: studentId, roleId: ROLE.STUDENT },
      { profileId: tutorId, roleId: ROLE.TUTOR }
    ];

    expect(
      isCourseStaffViewer({
        isOrgAdmin: false,
        roleId: courseViewerRoleId(studentId, members)
      })
    ).toBe(false);

    expect(
      isCourseStaffViewer({
        isOrgAdmin: false,
        roleId: courseViewerRoleId(tutorId, members)
      })
    ).toBe(true);

    expect(
      isCourseStaffViewer({
        isOrgAdmin: true,
        roleId: courseViewerRoleId('org-admin', members)
      })
    ).toBe(true);
  });
});
