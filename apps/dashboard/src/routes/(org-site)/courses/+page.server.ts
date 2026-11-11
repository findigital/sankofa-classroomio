import type { MetaTagsProps } from 'svelte-meta-tags';
import { classroomio, type InferResponseType } from '$lib/utils/services/api';
import { getVisitorHeaders, safeServerApi } from '$lib/utils/services/api/server';
import { redirect } from '@sveltejs/kit';
import { mapPublicCoursesToLandingPageCourses } from '$features/org/utils/landing-page';
import { filterTagGroupsForCatalog, resolveCatalogPresentation } from '@cio/utils/functions';

type GetPublicCoursesRequest = typeof classroomio.organization.courses.public.$get;
type GetPublicCoursesSuccess = Extract<InferResponseType<GetPublicCoursesRequest>, { success: true }>;
type GetPublicTagsRequest = typeof classroomio.organization.tags.public.$get;
type GetPublicTagsSuccess = Extract<InferResponseType<GetPublicTagsRequest>, { success: true }>;

function normalizeTagsParam(rawTags: string | null): string[] {
  const normalized = rawTags
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return normalized ?? [];
}

export const load = async ({ parent, url, cookies }) => {
  const { isOrgSite, orgSiteName, org, locals } = await parent();

  if (!isOrgSite || !org) {
    throw redirect(307, '/');
  }

  const siteName = orgSiteName || org.siteName;
  if (!siteName) {
    throw redirect(307, '/');
  }

  const catalog = resolveCatalogPresentation(org.settings);
  const normalizedTags = normalizeTagsParam(url.searchParams.get('tags'));
  const normalizedTypes = catalog.showCourseTypeFilter ? normalizeTagsParam(url.searchParams.get('types')) : [];
  const activeSearch = url.searchParams.get('search')?.trim() ?? '';
  const rawPricing = url.searchParams.get('pricing');
  const activePricing =
    catalog.hideCoursePricing || (rawPricing !== 'free' && rawPricing !== 'paid') ? undefined : rawPricing;

  const requestedPage = Number(url.searchParams.get('page'));
  const currentPage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const tagsResultPromise = safeServerApi<GetPublicTagsSuccess>(() =>
    classroomio.organization.tags.public.$get({
      query: {
        siteName
      }
    })
  );

  const tagsResult = await tagsResultPromise;
  const visibleTagGroups = filterTagGroupsForCatalog(
    tagsResult.ok ? tagsResult.body.data : [],
    catalog.filterTagGroupIds
  );
  const allowedTagSlugs = new Set(visibleTagGroups.flatMap((group) => group.tags.map((tag) => tag.slug)));
  const activeTags =
    catalog.filterTagGroupIds === null ? normalizedTags : normalizedTags.filter((slug) => allowedTagSlugs.has(slug));
  const normalizedTagsQuery = activeTags.length > 0 ? activeTags.join(',') : undefined;
  const normalizedTypesQuery = normalizedTypes.length > 0 ? normalizedTypes.join(',') : undefined;

  const coursesResult = await safeServerApi<GetPublicCoursesSuccess>(() =>
    classroomio.organization.courses.public.$get(
      {
        query: {
          siteName,
          page: String(currentPage),
          ...(normalizedTagsQuery ? { tags: normalizedTagsQuery } : {}),
          ...(normalizedTypesQuery ? { types: normalizedTypesQuery } : {}),
          ...(activeSearch ? { search: activeSearch } : {}),
          ...(activePricing ? { pricing: activePricing } : {})
        }
      },
      getVisitorHeaders(cookies)
    )
  );
  const courseData = coursesResult.ok
    ? coursesResult.body.data
    : {
        courses: [],
        hasMoreCourses: false,
        total: 0,
        page: currentPage,
        limit: 0,
        totalPages: 0,
        courseTypeCounts: [],
        catalogLocked: false
      };
  const canonicalUrl = new URL(url.pathname, url.origin).href;
  const orgTitle = `${org.name} – All Courses`;
  const orgDescription = `Browse all courses offered by ${org.name}`;

  const pageMetaTags = Object.freeze({
    title: orgTitle,
    description: orgDescription,
    canonical: canonicalUrl,
    openGraph: {
      type: 'website',
      url: canonicalUrl,
      title: orgTitle,
      description: orgDescription
    }
  } satisfies MetaTagsProps);

  return {
    org,
    courses: mapPublicCoursesToLandingPageCourses(courseData.courses),
    tagGroups: visibleTagGroups,
    activeTags,
    hideCoursePricing: catalog.hideCoursePricing,
    showCourseTypeFilter: catalog.showCourseTypeFilter,
    courseTypeCounts: courseData.courseTypeCounts,
    activeTypes: normalizedTypes,
    activeSearch,
    activePricing,
    pagination: {
      page: courseData.page,
      perPage: courseData.limit,
      total: courseData.total,
      totalPages: courseData.totalPages
    },
    pageMetaTags,
    catalogLocked: courseData.catalogLocked,
    showSignIn: courseData.catalogLocked && !locals?.user
  };
};
