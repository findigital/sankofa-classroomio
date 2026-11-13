export type CourseLoadFailure = 'rate_limited' | 'unavailable';

/**
 * Rate limits and upstream failures are recoverable. Missing courses stay 404s.
 */
export function classifyCourseLoadFailure(status: number): CourseLoadFailure | null {
  if (status === 429) return 'rate_limited';
  if (status === 0 || status >= 500) return 'unavailable';

  return null;
}
