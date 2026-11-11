// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte/svelte5';

vi.mock('$env/static/public', () => ({
  PUBLIC_IS_SELFHOSTED: 'false',
  PUBLIC_SERVER_URL: 'http://localhost:3002'
}));

vi.mock('$app/environment', () => ({ browser: false, dev: true, building: false }));

vi.mock('$lib/utils/functions/translations', async () => {
  const { readable } = await import('svelte/store');
  const translate = (key: string) => key;

  return { t: readable(translate) };
});

vi.mock('$features/pace/api/pace.svelte', () => ({
  paceApi: {
    fellows: [
      {
        memberId: 1,
        profileId: 'fellow',
        name: 'Bea Fellow',
        email: null,
        isMinor: false,
        lastActivityAt: null,
        lessonsCompleted: 1,
        lessonsRequired: 2,
        exercisesCompleted: 0,
        exercisesRequired: 1,
        overdueCount: 0,
        overdueItems: [],
        mentors: [{ profileId: 'mentor', name: 'Ada Mentor' }],
        flags: [],
        pace: 'on_pace'
      }
    ],
    quietDays: 14,
    courses: [],
    cohorts: [],
    loadPace: vi.fn().mockResolvedValue(undefined)
  }
}));

import PacePage from './pace.svelte';

describe('Fellow pace page', () => {
  it('renders the pace table, not only the title', () => {
    render(PacePage);

    expect(screen.getByText('pace.heading')).toBeTruthy();
    expect(screen.getByText('pace.filters.all_cohorts')).toBeTruthy();
    expect(screen.getByText('Bea Fellow')).toBeTruthy();
    expect(screen.queryByText('fellow@example.com')).toBeNull();
  });
});
