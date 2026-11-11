import { ROLE } from '@cio/utils/constants';

export type PostAuthMembership = {
  id: string;
  roleId: number;
  siteName?: string | null;
};

const AUTH_ENTRY_PATHS = new Set(['/login', '/signup']);

function isStaffRole(roleId: number): boolean {
  return roleId === ROLE.ADMIN || roleId === ROLE.TUTOR;
}

/**
 * Where a fresh sign-in should land. Students go to the learner home.
 * Staff go to the organization dashboard. Other paths keep the existing router.
 */
export function postAuthDestination(options: {
  pathname: string;
  isOrgSite: boolean;
  orgId?: string | null;
  orgSiteName?: string | null;
  organizations: PostAuthMembership[];
}): string | null {
  if (!AUTH_ENTRY_PATHS.has(options.pathname)) return null;
  if (options.organizations.length === 0) return null;

  const membership = options.organizations.find(
    (organization) =>
      (options.orgId && organization.id === options.orgId) ||
      (options.orgSiteName && organization.siteName === options.orgSiteName)
  );

  if (membership && isStaffRole(membership.roleId) && membership.siteName) {
    return `/org/${membership.siteName}`;
  }

  if (membership?.roleId === ROLE.STUDENT) {
    return '/lms';
  }

  const manager = options.organizations.find(
    (organization) => isStaffRole(organization.roleId) && organization.siteName
  );
  if (manager?.siteName && !options.isOrgSite) {
    return `/org/${manager.siteName}`;
  }

  if (options.isOrgSite || options.organizations.some((organization) => organization.roleId === ROLE.STUDENT)) {
    return '/lms';
  }

  return null;
}
