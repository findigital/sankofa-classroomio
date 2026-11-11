import { env } from '$env/dynamic/public';

/** Exactly `true` shows fellow messaging. Any other value keeps it hidden. */
export const MESSAGING_ENABLED = env.PUBLIC_MESSAGING_ENABLED === 'true';
