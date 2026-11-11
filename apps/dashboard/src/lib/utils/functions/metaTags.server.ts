import type { MetaTagsProps } from 'svelte-meta-tags';
import type { OrgSiteInfo } from '$features/app/layout-setup';
import { PUBLIC_IS_SELFHOSTED } from '$env/static/public';
import { env as publicEnv } from '$env/dynamic/public';
import { buildOrgSiteTitle, extractOrgSiteMetaCopy } from '$lib/utils/functions/org-site-meta';
import { resolveOrgSiteOgImageUrl } from '$lib/utils/functions/org-site-og-url';
import { appBrandName, defaultDocumentTitle, twitterSiteMeta } from '$lib/utils/functions/brand';

const isSelfHosted = PUBLIC_IS_SELFHOSTED === 'true';

const DEFAULT_DESCRIPTION = 'Courses, lessons, and training in one place.';

function openGraphImageType(imageUrl: string): string {
  const path = imageUrl.split('?')[0].toLowerCase();
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  if (path.endsWith('.webp')) return 'image/webp';
  if (path.endsWith('.gif')) return 'image/gif';

  return 'image/png';
}
const ORG_OG_WIDTH = 1200;
const ORG_OG_HEIGHT = 630;

async function resolveOgImageUrl(url: URL, orgSiteInfo: OrgSiteInfo): Promise<string> {
  const envUrl = publicEnv.PUBLIC_OG_IMAGE_URL?.trim();
  if (envUrl) {
    return envUrl;
  }

  if (orgSiteInfo.isOrgSite && orgSiteInfo.org?.siteName) {
    const dynamicOgUrl = await resolveOrgSiteOgImageUrl({
      siteName: orgSiteInfo.org.siteName,
      pageOrigin: url.origin,
      isSelfHosted,
      mediaCdnUrl: publicEnv.PUBLIC_MEDIA_CDN_URL,
      publicServerUrl: publicEnv.PUBLIC_SERVER_URL
    });
    if (dynamicOgUrl) {
      return dynamicOgUrl;
    }
  }

  if (isSelfHosted) {
    const org = orgSiteInfo.org;
    if (!org) {
      return new URL('/logo-512.png', url.origin).href;
    }

    const orgImage =
      org.avatarUrl ||
      org.landingpage?.header?.banner?.image ||
      (org as { customization?: { dashboard?: { bannerImage?: string } } }).customization?.dashboard?.bannerImage;
    if (orgImage) {
      try {
        return new URL(orgImage, url.origin).href;
      } catch {
        // fall through to bundled default
      }
    }
  }

  return new URL('/logo-512.png', url.origin).href;
}

function buildOrgOpenGraphImages(ogImageUrl: string, orgName: string) {
  return [
    {
      url: ogImageUrl,
      alt: `${orgName} learning platform`,
      width: ORG_OG_WIDTH,
      height: ORG_OG_HEIGHT,
      secureUrl: ogImageUrl.startsWith('https://') ? ogImageUrl : undefined,
      type: 'image/png'
    }
  ];
}

function resolveOrgSiteMeta(orgSiteInfo: OrgSiteInfo): {
  title: string;
  description: string;
  siteName: string;
} | null {
  const org = orgSiteInfo.org;
  if (!orgSiteInfo.isOrgSite || !org?.name?.trim()) {
    return null;
  }

  const orgName = org.name.trim();
  const metaCopy = extractOrgSiteMetaCopy(org.landingpage);

  return {
    title: publicEnv.PUBLIC_APP_TITLE?.trim() || buildOrgSiteTitle(orgName, metaCopy.heading),
    description:
      publicEnv.PUBLIC_APP_DESCRIPTION?.trim() ||
      metaCopy.description ||
      `Explore courses and training programs from ${orgName}.`,
    siteName: orgName
  };
}

export async function getBaseMetaTags(url: URL, orgSiteInfo: OrgSiteInfo): Promise<MetaTagsProps> {
  const orgMeta = resolveOrgSiteMeta(orgSiteInfo);

  const title =
    orgMeta?.title ||
    publicEnv.PUBLIC_APP_TITLE?.trim() ||
    (isSelfHosted && orgSiteInfo.org?.name ? `${orgSiteInfo.org.name} | Learning Platform` : defaultDocumentTitle());

  const description = orgMeta?.description || publicEnv.PUBLIC_APP_DESCRIPTION?.trim() || DEFAULT_DESCRIPTION;

  const siteName =
    orgMeta?.siteName ||
    publicEnv.PUBLIC_APP_TITLE?.trim() ||
    (isSelfHosted && orgSiteInfo.org?.name ? orgSiteInfo.org.name : null) ||
    appBrandName();

  const ogImageUrl = await resolveOgImageUrl(url, orgSiteInfo);
  const usesDynamicOrgOg =
    orgSiteInfo.isOrgSite && Boolean(orgSiteInfo.org?.siteName) && !publicEnv.PUBLIC_OG_IMAGE_URL?.trim();

  const imageAlt = `${siteName} learning platform`;
  const openGraphImages = usesDynamicOrgOg
    ? buildOrgOpenGraphImages(ogImageUrl, siteName)
    : [
        {
          url: ogImageUrl,
          alt: imageAlt,
          width: 512,
          height: 512,
          secureUrl: ogImageUrl.startsWith('https://') ? ogImageUrl : undefined,
          type: openGraphImageType(ogImageUrl)
        }
      ];

  return Object.freeze({
    title,
    description,
    canonical: new URL(url.pathname, url.origin).href,
    openGraph: {
      type: 'website',
      url: new URL(url.pathname, url.origin).href,
      locale: 'en_US',
      title,
      description,
      siteName,
      images: openGraphImages
    },
    twitter: {
      ...twitterSiteMeta(),
      cardType: 'summary_large_image' as const,
      title,
      description,
      image: ogImageUrl,
      imageAlt
    }
  });
}
