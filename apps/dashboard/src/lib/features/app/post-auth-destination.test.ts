import { describe, expect, it } from 'vitest';

import { postAuthDestination } from './post-auth-destination';

const staff = { id: 'org-1', roleId: 1, siteName: 'sankofa' };
const tutor = { id: 'org-1', roleId: 2, siteName: 'sankofa' };
const student = { id: 'org-1', roleId: 3, siteName: 'sankofa' };

describe('postAuthDestination', () => {
  it('sends staff from login to the organization dashboard', () => {
    expect(
      postAuthDestination({
        pathname: '/login',
        isOrgSite: true,
        orgId: 'org-1',
        orgSiteName: 'sankofa',
        organizations: [staff]
      })
    ).toBe('/org/sankofa');
    expect(
      postAuthDestination({
        pathname: '/signup',
        isOrgSite: true,
        orgId: 'org-1',
        organizations: [tutor]
      })
    ).toBe('/org/sankofa');
  });

  it('sends students from login to the learner home', () => {
    expect(
      postAuthDestination({
        pathname: '/login',
        isOrgSite: true,
        orgId: 'org-1',
        organizations: [student]
      })
    ).toBe('/lms');
  });

  it('leaves the public home and other routes alone', () => {
    expect(
      postAuthDestination({
        pathname: '/',
        isOrgSite: true,
        orgId: 'org-1',
        organizations: [student]
      })
    ).toBeNull();
    expect(
      postAuthDestination({
        pathname: '/courses',
        isOrgSite: true,
        orgId: 'org-1',
        organizations: [staff]
      })
    ).toBeNull();
  });
});
