import { ROLE } from '@cio/utils/constants';

type CourseViewerMember = {
  profileId?: string | null;
  roleId?: number | string | null;
};

export function courseViewerRoleId(profileId: string | undefined, members: CourseViewerMember[]): number | null {
  if (!profileId) return null;

  const member = members.find((item) => item.profileId === profileId);
  if (!member || member.roleId == null || member.roleId === '') return null;

  const roleId = Number(member.roleId);
  return Number.isFinite(roleId) ? roleId : null;
}

export function isCourseStaffViewer(input: { isOrgAdmin: boolean | null; roleId: number | null }): boolean {
  if (input.isOrgAdmin) return true;

  return input.roleId === ROLE.ADMIN || input.roleId === ROLE.TUTOR;
}
