import { env as publicEnv } from '$env/dynamic/public';

export const DEFAULT_SOURCE_URL = 'https://github.com/findigital/sankofa-classroomio';

export function appBrandName(): string {
  return publicEnv.PUBLIC_APP_NAME?.trim() || publicEnv.PUBLIC_APP_TITLE?.trim() || 'Learning platform';
}

export function defaultDocumentTitle(): string {
  const title = publicEnv.PUBLIC_APP_TITLE?.trim();
  if (title) return title;

  const name = publicEnv.PUBLIC_APP_NAME?.trim();
  if (name) return `${name} | Learning platform`;

  return 'Learning platform';
}

export function brandedPageTitle(label: string): string {
  const pageLabel = label.trim();
  const brand = appBrandName();
  if (!pageLabel) return brand;

  return `${pageLabel} - ${brand}`;
}

export function supportEmail(): string {
  return publicEnv.PUBLIC_SUPPORT_EMAIL?.trim() || '';
}

export function twitterSiteMeta(): { handle: string; site: string } | undefined {
  const raw = publicEnv.PUBLIC_TWITTER_HANDLE?.trim();
  if (!raw) return undefined;

  const handle = raw.startsWith('@') ? raw : `@${raw}`;

  return { handle, site: handle };
}

export function sourceOfferUrl(): string {
  const configured = publicEnv.PUBLIC_SOURCE_URL?.trim();
  if (!configured) return DEFAULT_SOURCE_URL;

  try {
    const url = new URL(configured);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
  } catch {
    return DEFAULT_SOURCE_URL;
  }

  return DEFAULT_SOURCE_URL;
}
