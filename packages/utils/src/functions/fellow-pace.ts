import { ROLE } from '../constants/roles';

export const FELLOW_QUIET_DAYS_DEFAULT = 14;
export const FELLOW_QUIET_DAYS_MIN = 1;
export const FELLOW_QUIET_DAYS_MAX = 365;

const DAY_MS = 24 * 60 * 60 * 1000;

export type FellowPaceFlag = 'gone_quiet' | 'overdue';

/**
 * Flags a fellow who has overdue work or no activity for `quietDays` full days.
 * A missing or unparseable last-activity time counts as gone quiet.
 */
export function fellowPaceFlags(input: {
  lastActivityAt: string | null;
  overdueCount: number;
  quietDays: number;
  now?: Date;
}): FellowPaceFlag[] {
  const now = input.now ?? new Date();
  const flags: FellowPaceFlag[] = [];
  const lastActivityMs = input.lastActivityAt ? new Date(input.lastActivityAt).getTime() : Number.NaN;
  const quietCutoff = now.getTime() - input.quietDays * DAY_MS;
  const goneQuiet = !Number.isFinite(lastActivityMs) || lastActivityMs <= quietCutoff;

  if (goneQuiet) {
    flags.push('gone_quiet');
  }

  if (input.overdueCount > 0) {
    flags.push('overdue');
  }

  return flags;
}

/**
 * Admins see every fellow. Tutors see only fellows assigned to them.
 * Every other role sees none.
 */
export function fellowsVisibleToViewer<T extends { mentors: { profileId: string }[] }>(
  fellows: T[],
  viewer: { roleId: number; profileId: string }
): T[] {
  if (viewer.roleId === ROLE.ADMIN) return fellows;

  if (viewer.roleId !== ROLE.TUTOR) return [];

  return fellows.filter((fellow) => fellow.mentors.some((mentor) => mentor.profileId === viewer.profileId));
}

const EMAIL_ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function withoutEmail(value: string): string {
  return EMAIL_ADDRESS.test(value.trim()) ? '' : value;
}

/**
 * Tutors do not receive email addresses. Admins keep the full record.
 */
export function paceFellowForViewer<
  T extends { email: string | null; name: string; mentors: { profileId: string; name: string }[] }
>(fellow: T, roleId: number): T {
  if (roleId !== ROLE.TUTOR) return fellow;

  return {
    ...fellow,
    email: null,
    name: withoutEmail(fellow.name),
    mentors: fellow.mentors.map((mentor) => ({
      ...mentor,
      name: withoutEmail(mentor.name)
    }))
  };
}

/** Full record for admins, the minor flag for an assigned tutor, otherwise deny. */
export function safeguardingAccess(roleId: number | null, assignedToViewer: boolean): 'full' | 'minor' | 'deny' {
  if (roleId === ROLE.ADMIN) return 'full';

  if (roleId === ROLE.TUTOR && assignedToViewer) return 'minor';

  return 'deny';
}
