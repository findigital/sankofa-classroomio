import { describe, expect, it } from 'vitest';
import * as z from 'zod';

import { ROLE } from '../src/constants/roles';
import {
  fellowPaceFlags,
  fellowsVisibleToViewer,
  paceFellowForViewer,
  safeguardingAccess
} from '../src/functions/fellow-pace';
import { ZUpdateProfile } from '../src/validation/account/account';
import {
  EMPTY_SAFEGUARDING,
  ZUpdateSafeguarding,
  safeguardingSnapshotsEqual,
  toMinorSafeguarding
} from '../src/validation/organization/fellow-pace';
import { ZPublicApiAudienceMemberResponse } from '../src/validation/public-api/audience-responses';
import {
  ZPublicApiCourseMemberDetailResponse,
  ZPublicApiCourseMemberResponse
} from '../src/validation/public-api/course-member-responses';
import { ZPublicApiTeamMemberResponse } from '../src/validation/public-api/team-responses';

const NOW = new Date('2026-06-15T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function daysBefore(days: number): string {
  return new Date(NOW.getTime() - days * DAY_MS).toISOString();
}

const FORBIDDEN_KEYS = [
  'isMinor',
  'is_minor',
  'guardianName',
  'guardianEmail',
  'guardianPhone',
  'guardian_name',
  'guardian_email',
  'guardian_phone',
  'consentStatus',
  'consentAt',
  'consent_status',
  'consent_at',
  'safeguarding',
  'notes'
];

function propertyNames(value: unknown, names: string[] = []): string[] {
  if (!value || typeof value !== 'object') return names;

  const record = value as Record<string, unknown>;

  if (record.properties && typeof record.properties === 'object') {
    for (const [key, child] of Object.entries(record.properties as Record<string, unknown>)) {
      names.push(key);
      propertyNames(child, names);
    }
  }

  for (const key of ['items', 'anyOf', 'oneOf', 'allOf']) {
    const child = record[key];

    if (Array.isArray(child)) {
      for (const entry of child) propertyNames(entry, names);
    } else {
      propertyNames(child, names);
    }
  }

  if (record.$defs && typeof record.$defs === 'object') {
    for (const child of Object.values(record.$defs as Record<string, unknown>)) {
      propertyNames(child, names);
    }
  }

  return names;
}

describe('fellowPaceFlags', () => {
  it('flags a fellow with no activity as gone quiet', () => {
    expect(fellowPaceFlags({ lastActivityAt: null, overdueCount: 0, quietDays: 14, now: NOW })).toEqual(['gone_quiet']);
  });

  it('does not flag activity inside the quiet window', () => {
    expect(fellowPaceFlags({ lastActivityAt: daysBefore(13), overdueCount: 0, quietDays: 14, now: NOW })).toEqual([]);
  });

  it('flags activity that is exactly the quiet window old', () => {
    expect(fellowPaceFlags({ lastActivityAt: daysBefore(14), overdueCount: 0, quietDays: 14, now: NOW })).toEqual([
      'gone_quiet'
    ]);
  });

  it('flags an overdue count on its own and together with silence', () => {
    expect(fellowPaceFlags({ lastActivityAt: daysBefore(1), overdueCount: 2, quietDays: 14, now: NOW })).toEqual([
      'overdue'
    ]);
    expect(fellowPaceFlags({ lastActivityAt: null, overdueCount: 1, quietDays: 14, now: NOW })).toEqual([
      'gone_quiet',
      'overdue'
    ]);
  });
});

describe('fellowsVisibleToViewer', () => {
  const assigned = { name: 'Assigned', mentors: [{ profileId: 'mentor-1' }] };
  const other = { name: 'Other', mentors: [{ profileId: 'mentor-2' }] };

  it('shows every fellow to an admin', () => {
    expect(fellowsVisibleToViewer([assigned, other], { roleId: ROLE.ADMIN, profileId: 'mentor-1' })).toEqual([
      assigned,
      other
    ]);
  });

  it('hides fellows who are not assigned to the tutor', () => {
    expect(fellowsVisibleToViewer([assigned, other], { roleId: ROLE.TUTOR, profileId: 'mentor-1' })).toEqual([
      assigned
    ]);
  });

  it('shows nothing to a student', () => {
    expect(fellowsVisibleToViewer([assigned, other], { roleId: ROLE.STUDENT, profileId: 'mentor-1' })).toEqual([]);
  });
});

describe('safeguarding access', () => {
  it('gives admins the full record and assigned tutors only the minor flag', () => {
    expect(safeguardingAccess(ROLE.ADMIN, false)).toBe('full');
    expect(safeguardingAccess(ROLE.TUTOR, true)).toBe('minor');
    expect(safeguardingAccess(ROLE.TUTOR, false)).toBe('deny');
    expect(safeguardingAccess(ROLE.STUDENT, true)).toBe('deny');
  });

  it('returns only the minor flag from a record that also holds guardian contact', () => {
    const view = toMinorSafeguarding({
      ...EMPTY_SAFEGUARDING,
      isMinor: true,
      guardianEmail: 'secret@example.com'
    });

    expect(view).toEqual({ isMinor: true });
    expect(Object.keys(view)).toEqual(['isMinor']);
  });

  it('treats an unchanged snapshot as the same record and rejects consent dates that do not match the status', () => {
    expect(safeguardingSnapshotsEqual(EMPTY_SAFEGUARDING, { ...EMPTY_SAFEGUARDING })).toBe(true);
    expect(safeguardingSnapshotsEqual(EMPTY_SAFEGUARDING, { ...EMPTY_SAFEGUARDING, isMinor: true })).toBe(false);

    expect(
      ZUpdateSafeguarding.safeParse({
        ...EMPTY_SAFEGUARDING,
        consentAt: '2026-01-01T00:00:00.000Z'
      }).success
    ).toBe(false);

    expect(
      ZUpdateSafeguarding.safeParse({
        ...EMPTY_SAFEGUARDING,
        consentStatus: 'granted',
        consentAt: null
      }).success
    ).toBe(false);

    expect(
      ZUpdateSafeguarding.parse({
        ...EMPTY_SAFEGUARDING,
        guardianName: '  ',
        guardianEmail: '',
        guardianPhone: '',
        notes: ''
      })
    ).toMatchObject({
      guardianName: null,
      guardianEmail: null,
      guardianPhone: null,
      notes: null,
      consentAt: null
    });
  });
});

describe('paceFellowForViewer', () => {
  const fellow = {
    email: 'fellow@example.com',
    name: 'Bea Fellow',
    mentors: [{ profileId: 'mentor', name: 'mentor@example.com' }]
  };

  it('drops email for a tutor and keeps a real name', () => {
    expect(paceFellowForViewer(fellow, ROLE.TUTOR)).toEqual({
      email: null,
      name: 'Bea Fellow',
      mentors: [{ profileId: 'mentor', name: '' }]
    });
  });

  it('keeps the full record for an admin', () => {
    expect(paceFellowForViewer(fellow, ROLE.ADMIN)).toEqual(fellow);
  });
});

describe('fellow-facing contracts omit safeguarding fields', () => {
  it.each([
    ['ZUpdateProfile', ZUpdateProfile],
    ['ZPublicApiAudienceMemberResponse', ZPublicApiAudienceMemberResponse],
    ['ZPublicApiCourseMemberResponse', ZPublicApiCourseMemberResponse],
    ['ZPublicApiCourseMemberDetailResponse', ZPublicApiCourseMemberDetailResponse],
    ['ZPublicApiTeamMemberResponse', ZPublicApiTeamMemberResponse]
  ])('%s does not publish consent or guardian fields', (_name, schema) => {
    const names = propertyNames(z.toJSONSchema(schema, { io: 'output', unrepresentable: 'any' }));

    expect(names.filter((name) => FORBIDDEN_KEYS.includes(name))).toEqual([]);
  });
});
