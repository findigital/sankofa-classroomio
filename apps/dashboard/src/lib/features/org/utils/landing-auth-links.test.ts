import { describe, expect, it } from 'vitest';

import { applySignedInAuthLinks } from './landing-page';
import { createDefaultLandingPageSettings } from './landing-page';

describe('applySignedInAuthLinks', () => {
  it('replaces login links with the signed-in destination', () => {
    const landing = createDefaultLandingPageSettings();
    landing.hero.primaryAction = { label: 'Log in', href: '/login' };
    landing.navItems = [
      { label: 'Courses', href: '/courses' },
      { label: 'Log in', href: '/login' }
    ];
    landing.footer.bottom = {
      text: '',
      links: [{ id: 'login', label: 'Log in', href: '/login?redirect=%2F' }]
    };

    const signedIn = applySignedInAuthLinks(landing, {
      signedIn: true,
      replacement: { label: 'Go to dashboard', href: '/org/sankofa' }
    });

    expect(signedIn.hero.primaryAction).toEqual({ label: 'Go to dashboard', href: '/org/sankofa' });
    expect(signedIn.navItems).toEqual([{ label: 'Courses', href: '/courses' }]);
    expect(signedIn.footer.bottom?.links).toEqual([{ id: 'login', label: 'Go to dashboard', href: '/org/sankofa' }]);
  });

  it('leaves logged-out links unchanged', () => {
    const landing = createDefaultLandingPageSettings();
    landing.hero.primaryAction = { label: 'Log in', href: '/login' };

    const loggedOut = applySignedInAuthLinks(landing, { signedIn: false, replacement: null });

    expect(loggedOut.hero.primaryAction).toEqual({ label: 'Log in', href: '/login' });
  });
});
