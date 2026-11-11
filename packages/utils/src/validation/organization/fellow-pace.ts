import * as z from 'zod';

import { FELLOW_QUIET_DAYS_MAX, FELLOW_QUIET_DAYS_MIN } from '../../functions/fellow-pace';

export const FellowConsentStatus = z.enum(['none', 'pending', 'granted', 'revoked']);
export type TFellowConsentStatus = z.infer<typeof FellowConsentStatus>;

const emptyToNull = (value: string | null) => {
  if (value === null) return null;

  const trimmed = value.trim();

  return trimmed === '' ? null : trimmed;
};

export const ZFellowPaceQuery = z.object({
  cohortId: z.string().uuid().optional(),
  courseId: z.string().uuid().optional(),
  quietDays: z.coerce.number().int().min(FELLOW_QUIET_DAYS_MIN).max(FELLOW_QUIET_DAYS_MAX).optional()
});

export type TFellowPaceQuery = z.infer<typeof ZFellowPaceQuery>;

export const ZFellowMemberParam = z.object({
  memberId: z.coerce.number().int().positive()
});

export type TFellowMemberParam = z.infer<typeof ZFellowMemberParam>;

export const ZMentorProfileParam = z.object({
  mentorProfileId: z.string().uuid()
});

export type TMentorProfileParam = z.infer<typeof ZMentorProfileParam>;

export const ZReplaceMentorFellows = z.object({
  fellowProfileIds: z
    .array(z.string().uuid())
    .max(500)
    .refine((ids) => new Set(ids).size === ids.length, 'Fellow ids must be unique')
});

export type TReplaceMentorFellows = z.infer<typeof ZReplaceMentorFellows>;

export const ZUpdateSafeguarding = z
  .object({
    isMinor: z.boolean(),
    guardianName: z.string().max(200).nullable().transform(emptyToNull),
    guardianEmail: z.union([z.email(), z.literal(''), z.null()]).transform((value) => {
      const email = emptyToNull(value);

      return email ? email.toLowerCase() : null;
    }),
    guardianPhone: z.string().max(40).nullable().transform(emptyToNull),
    consentStatus: FellowConsentStatus,
    consentAt: z.string().datetime().nullable(),
    notes: z.string().max(4000).nullable().transform(emptyToNull)
  })
  .superRefine((value, ctx) => {
    if (value.consentStatus === 'none' && value.consentAt) {
      ctx.addIssue({
        code: 'custom',
        path: ['consentAt'],
        message: 'Consent date must be empty when status is none'
      });
    }

    if (value.consentStatus !== 'none' && !value.consentAt) {
      ctx.addIssue({
        code: 'custom',
        path: ['consentAt'],
        message: 'Consent date is required unless status is none'
      });
    }
  });

export type TUpdateSafeguarding = z.infer<typeof ZUpdateSafeguarding>;

export type SafeguardingSnapshot = {
  isMinor: boolean;
  guardianName: string | null;
  guardianEmail: string | null;
  guardianPhone: string | null;
  consentStatus: TFellowConsentStatus;
  consentAt: string | null;
  notes: string | null;
};

export const EMPTY_SAFEGUARDING: SafeguardingSnapshot = {
  isMinor: false,
  guardianName: null,
  guardianEmail: null,
  guardianPhone: null,
  consentStatus: 'none',
  consentAt: null,
  notes: null
};

/** True when two stored safeguarding records describe the same staff-facing values. */
export function safeguardingSnapshotsEqual(left: SafeguardingSnapshot, right: SafeguardingSnapshot): boolean {
  return (
    left.isMinor === right.isMinor &&
    left.guardianName === right.guardianName &&
    left.guardianEmail === right.guardianEmail &&
    left.guardianPhone === right.guardianPhone &&
    left.consentStatus === right.consentStatus &&
    left.consentAt === right.consentAt &&
    left.notes === right.notes
  );
}

/**
 * The only safeguarding payload a mentor may receive.
 * Guardian contact, consent, and notes are omitted on purpose.
 */
export function toMinorSafeguarding(record: Pick<SafeguardingSnapshot, 'isMinor'>): { isMinor: boolean } {
  return { isMinor: record.isMinor };
}
