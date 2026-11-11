import { env } from '$env/dynamic/public';
import { PLAN } from '@cio/utils/plans';

/** Exactly `true` hides the upstream Enterprise plan badge in the org sidebar. */
export function hideUpstreamPromos() {
  return env.PUBLIC_HIDE_UPSTREAM_PROMOS === 'true';
}

/** The Enterprise badge is the upstream plan promo. Other plan badges stay. */
export function showOrgPlanBadge(planName: string | undefined) {
  return !(hideUpstreamPromos() && planName === PLAN.ENTERPRISE);
}
