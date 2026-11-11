import { env as publicEnv } from '$env/dynamic/public';
import { PLAN } from '@cio/utils/plans';

/** Upstream ClassroomIO marketing cards. Set PUBLIC_HIDE_UPSTREAM_PROMOS=true to hide them. */
export const HIDE_UPSTREAM_PROMOS = publicEnv.PUBLIC_HIDE_UPSTREAM_PROMOS === 'true';

/** Exactly `true` hides the upstream Enterprise plan badge in the org sidebar. */
export function hideUpstreamPromos() {
  return publicEnv.PUBLIC_HIDE_UPSTREAM_PROMOS === 'true';
}

/** The Enterprise badge is the upstream plan promo. Other plan badges stay. */
export function showOrgPlanBadge(planName: string | undefined) {
  return !(hideUpstreamPromos() && planName === PLAN.ENTERPRISE);
}
