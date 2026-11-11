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

/** Full record for admins, the minor flag for an assigned tutor, otherwise deny. */
export function safeguardingAccess(roleId: number | null, assignedToViewer: boolean): 'full' | 'minor' | 'deny' {
  if (roleId === ROLE.ADMIN) return 'full';

  if (roleId === ROLE.TUTOR && assignedToViewer) return 'minor';

  return 'deny';
}
