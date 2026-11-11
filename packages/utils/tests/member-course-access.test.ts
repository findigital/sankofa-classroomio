import { describe, expect, it } from 'vitest';

import { isAutoEnrollMembersEnabled, resolveMemberCourseCta } from '../src/functions/member-course-access';

describe('isAutoEnrollMembersEnabled', () => {
  it('follows the members-only catalog when the org has not chosen', () => {
    expect(isAutoEnrollMembersEnabled(undefined)).toBe(false);
    expect(isAutoEnrollMembersEnabled({})).toBe(false);
    expect(isAutoEnrollMembersEnabled({ membersOnlyCatalog: true })).toBe(true);
    expect(isAutoEnrollMembersEnabled({ membersOnlyCatalog: false })).toBe(false);
  });

  it('uses an explicit auto-enroll choice', () => {
    expect(isAutoEnrollMembersEnabled({ membersOnlyCatalog: true, autoEnrollMembers: false })).toBe(false);
    expect(isAutoEnrollMembersEnabled({ membersOnlyCatalog: false, autoEnrollMembers: true })).toBe(true);
  });
});

describe('resolveMemberCourseCta', () => {
  const courseId = 'course-1';

  it('sends a signed-in member to the course when the catalog is members-only', () => {
    expect(
      resolveMemberCourseCta({
        membersOnlyCatalog: true,
        autoEnrollMembers: true,
        isOrgMember: true,
        started: false,
        courseId
      })
    ).toEqual({
      mode: 'open',
      started: false,
      href: '/courses/course-1/lessons'
    });
  });

  it('continues a member who has already started', () => {
    expect(
      resolveMemberCourseCta({
        membersOnlyCatalog: true,
        autoEnrollMembers: false,
        isOrgMember: true,
        started: true,
        courseId
      }).href
    ).toBe('/courses/course-1/lessons?next=true');
  });

  it('keeps the enroll action for visitors and for open catalogs', () => {
    expect(
      resolveMemberCourseCta({
        membersOnlyCatalog: true,
        autoEnrollMembers: true,
        isOrgMember: false,
        started: false,
        courseId
      }).mode
    ).toBe('enroll');

    expect(
      resolveMemberCourseCta({
        membersOnlyCatalog: false,
        autoEnrollMembers: false,
        isOrgMember: true,
        started: true,
        courseId
      }).mode
    ).toBe('enroll');
  });

  it('opens the course when auto-enroll is on without a members-only catalog', () => {
    expect(
      resolveMemberCourseCta({
        membersOnlyCatalog: false,
        autoEnrollMembers: true,
        isOrgMember: true,
        started: false,
        courseId
      }).mode
    ).toBe('open');
  });
});
