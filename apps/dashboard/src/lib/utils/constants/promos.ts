import { env as publicEnv } from '$env/dynamic/public';

/** Upstream ClassroomIO marketing cards. Set PUBLIC_HIDE_UPSTREAM_PROMOS=true to hide them. */
export const HIDE_UPSTREAM_PROMOS = publicEnv.PUBLIC_HIDE_UPSTREAM_PROMOS === 'true';
