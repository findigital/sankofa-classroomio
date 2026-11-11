import { describe, expect, it } from 'vitest';
import { PLAN } from '@cio/utils/plans';

import { env } from '$env/dynamic/public';
import { showOrgPlanBadge } from './promos';

const publicEnv = env as { PUBLIC_HIDE_UPSTREAM_PROMOS?: string };

describe('showOrgPlanBadge', () => {
  it('hides only the Enterprise badge when the promo flag is exactly true', () => {
    publicEnv.PUBLIC_HIDE_UPSTREAM_PROMOS = 'true';

    expect(showOrgPlanBadge(PLAN.ENTERPRISE)).toBe(false);
    expect(showOrgPlanBadge(PLAN.BASIC)).toBe(true);

    publicEnv.PUBLIC_HIDE_UPSTREAM_PROMOS = 'false';

    expect(showOrgPlanBadge(PLAN.ENTERPRISE)).toBe(true);
  });
});
