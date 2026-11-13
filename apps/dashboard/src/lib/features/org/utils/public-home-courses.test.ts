// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte/svelte5';
import { EditorialLandingPage, QuartzLandingPage } from '@cio/ui/custom/org-landing-page';
import { ensureTranslations } from '$lib/utils/functions/translations';

vi.mock('mode-watcher', () => ({
  mode: {
    subscribe(run: (value: string) => void) {
      run('light');
      return () => {};
    }
  },
  setMode: () => {},
  resetMode: () => {}
}));

vi.mock('$features/app/init.svelte', () => ({
  appInitApi: {
    loading: false,
    error: null,
    isInitializedAndReady: false,
    data: null,
    pendingOrgInvite: null
  }
}));

import HomePage from '../../../../routes/+page.svelte';

const hiddenCourseTitle = 'Hidden catalog course';

function homeData(
  ThemeComponent: typeof QuartzLandingPage,
  courses: Array<{ id: string; title: string; description: string }> = []
) {
  return {
    isOrgSite: true as const,
    orgSiteName: 'sankofa',
    locals: { user: null },
    courses,
    hasMoreCourses: courses.length > 0,
    catalogLocked: courses.length === 0,
    ThemeComponent,
    org: {
      id: 'org-1',
      name: 'Sankofa',
      siteName: 'sankofa',
      avatarUrl: '',
      landingpage: {
        theme: 'quartz',
        hero: {
          heading: 'The fellowship',
          subheading: 'Learn with us.',
          primaryAction: { label: 'View the fellowship', href: '/fellowship' },
          secondaryAction: { label: 'Log in', href: '/login' }
        },
        navItems: [{ label: 'About', href: '/about' }],
        footer: { brand: { socials: [] }, columns: [] },
        links: {
          enabled: true,
          heading: 'Learning platforms',
          cards: [
            {
              icon: 'book-open',
              title: 'Classroom',
              description: 'Open the classroom',
              href: 'https://example.com/class'
            }
          ]
        }
      }
    }
  };
}

beforeAll(async () => {
  await ensureTranslations('en');
});

describe('public org home courses section', () => {
  it('hides the catalog on the signed-out home and keeps the hero and links', () => {
    for (const ThemeComponent of [QuartzLandingPage, EditorialLandingPage]) {
      const view = render(HomePage, { props: { data: homeData(ThemeComponent) } });

      expect(screen.getByRole('link', { name: 'View the fellowship' })).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Log in' })).toBeTruthy();
      expect(screen.getByRole('heading', { name: 'Learning platforms' })).toBeTruthy();
      expect(view.container.querySelector('#courses')).toBeNull();
      expect(screen.queryByText('Courses')).toBeNull();
      expect(screen.queryByText('Browse all published courses')).toBeNull();
      expect(screen.queryByText('This catalog is for members')).toBeNull();

      view.unmount();
    }

    const listed = render(HomePage, {
      props: {
        data: homeData(QuartzLandingPage, [{ id: 'course-1', title: hiddenCourseTitle, description: 'Members only' }])
      }
    });

    expect(screen.queryByText(hiddenCourseTitle)).toBeNull();
    expect(screen.queryByText('Browse all published courses')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Learning platforms' })).toBeTruthy();
    listed.unmount();
  });

  it('still shows the catalog when a theme is rendered without the home flag', () => {
    render(EditorialLandingPage, {
      props: {
        orgName: 'Sankofa',
        navItems: [{ label: 'About', href: '/about' }],
        hero: {
          heading: 'The fellowship',
          subheading: 'Learn with us.',
          primaryAction: { label: 'View the fellowship', href: '/fellowship' },
          secondaryAction: { label: 'Log in', href: '/login' }
        },
        courses: [],
        coursesLoaded: true,
        footer: { brand: { socials: [] }, columns: [] },
        links: {
          enabled: true,
          heading: 'Learning platforms',
          cards: [
            {
              icon: 'book-open',
              title: 'Classroom',
              description: 'Open the classroom',
              href: 'https://example.com/class'
            }
          ]
        },
        labels: {
          catalogEyebrow: 'Courses',
          catalogHeading: 'Courses',
          catalogDescription: 'Browse all published courses',
          catalogEmptyTitle: 'This catalog is for members',
          catalogEmptyDescription: 'Only members of this academy can browse courses here.'
        }
      }
    });

    expect(screen.getByRole('link', { name: 'View the fellowship' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Learning platforms' })).toBeTruthy();
    expect(screen.getAllByText('Courses').length).toBeGreaterThan(0);
    expect(screen.getByText('Browse all published courses')).toBeTruthy();
    expect(screen.getByText('This catalog is for members')).toBeTruthy();
  });
});
