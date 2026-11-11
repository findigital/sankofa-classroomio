import { redirect } from '@sveltejs/kit';

import { ROLE } from '@cio/utils/constants';

function safeRedirectPath(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null;

  return value;
}

export const load = async ({ parent, url }) => {
  const { locals, isOrgSite, org } = await parent();
  if (!locals.user) return {};

  const requested = safeRedirectPath(url.searchParams.get('redirect'));
  if (requested) {
    redirect(303, requested);
  }

  if (!isOrgSite || !org?.siteName) return {};

  const roleId = locals.orgRoles?.[org.id];
  if (roleId === ROLE.ADMIN || roleId === ROLE.TUTOR) {
    redirect(303, `/org/${org.siteName}`);
  }

  if (roleId === ROLE.STUDENT) {
    redirect(303, '/lms');
  }

  return {};
};
