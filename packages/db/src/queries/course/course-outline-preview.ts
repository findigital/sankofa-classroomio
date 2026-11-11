export type CourseOutlinePreview = {
  label: string;
  duration?: string;
};

export function formatLessonDuration(minutes: number): string | undefined {
  if (!Number.isFinite(minutes) || minutes <= 0) return undefined;

  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded} min`;

  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;

  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export function takeCourseOutlinePreviews(
  rows: Array<{ courseId: string; title: string; sessionDurationMinutes: number | null }>,
  limit = 4
): Record<string, CourseOutlinePreview[]> {
  const grouped: Record<string, CourseOutlinePreview[]> = {};

  for (const row of rows) {
    const items = grouped[row.courseId] ?? [];
    grouped[row.courseId] = items;
    if (items.length >= limit) continue;

    const label = row.title.trim();
    if (!label) continue;

    const duration = row.sessionDurationMinutes == null ? undefined : formatLessonDuration(row.sessionDurationMinutes);
    items.push(duration ? { label, duration } : { label });
  }

  return grouped;
}
