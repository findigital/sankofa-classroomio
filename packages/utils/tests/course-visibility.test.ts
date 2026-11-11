import { describe, expect, it } from 'vitest';

import { canListOrgCatalog, evaluateCourseOpen } from '../src/functions/course-visibility';

const anonymous = { isAuthenticated: false, isOrgMember: false, isCourseStaff: false };
const student = { isAuthenticated: true, isOrgMember: true, isCourseStaff: false };
const outsider = { isAuthenticated: true, isOrgMember: false, isCourseStaff: false };
const tutor = { isAuthenticated: true, isOrgMember: true, isCourseStaff: true };
const admin = { isAuthenticated: true, isOrgMember: true, isCourseStaff: true };

describe('canListOrgCatalog', () => {
  it('lists courses for everyone when the org catalog is public', () => {
    expect(canListOrgCatalog(false, false)).toBe(true);
    expect(canListOrgCatalog(false, true)).toBe(true);
  });

  it('lists courses only for org members when the catalog is members-only', () => {
    expect(canListOrgCatalog(true, false)).toBe(false);
    expect(canListOrgCatalog(true, true)).toBe(true);
  });
});

describe('evaluateCourseOpen', () => {
  it('hides unpublished courses from anonymous visitors and students', () => {
    expect(evaluateCourseOpen({ isPublished: false, membersOnly: false, ...anonymous })).toBe('hidden');
    expect(evaluateCourseOpen({ isPublished: false, membersOnly: true, ...anonymous })).toBe('hidden');
    expect(evaluateCourseOpen({ isPublished: false, membersOnly: false, ...student })).toBe('hidden');
    expect(evaluateCourseOpen({ isPublished: false, membersOnly: true, ...student })).toBe('hidden');
  });

  it('lets org admins and the course tutors open unpublished courses', () => {
    expect(evaluateCourseOpen({ isPublished: false, membersOnly: true, ...tutor })).toBe('allow');
    expect(evaluateCourseOpen({ isPublished: false, membersOnly: false, ...admin })).toBe('allow');
  });

  it('sends anonymous visitors to sign in for published courses on a members-only catalog', () => {
    expect(evaluateCourseOpen({ isPublished: true, membersOnly: true, ...anonymous })).toBe('sign-in');
  });

  it('hides published members-only courses from signed-in people who are not org members', () => {
    expect(evaluateCourseOpen({ isPublished: true, membersOnly: true, ...outsider })).toBe('hidden');
  });

  it('lets org members open published courses', () => {
    expect(evaluateCourseOpen({ isPublished: true, membersOnly: true, ...student })).toBe('allow');
    expect(evaluateCourseOpen({ isPublished: true, membersOnly: true, ...tutor })).toBe('allow');
  });

  it('leaves published courses public when the catalog is not members-only', () => {
    expect(evaluateCourseOpen({ isPublished: true, membersOnly: false, ...anonymous })).toBe('allow');
    expect(evaluateCourseOpen({ isPublished: true, membersOnly: false, ...outsider })).toBe('allow');
  });
});
