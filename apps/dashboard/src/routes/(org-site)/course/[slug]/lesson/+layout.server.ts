import { classroomio, type InferResponseType } from '$lib/utils/services/api';
import { getVisitorHeaders, safeServerApi } from '$lib/utils/services/api/server';
import { redirectToSignIn } from '$lib/utils/functions/sign-in-redirect';
import { error } from '@sveltejs/kit';

type GetPublicCourseRequest = (typeof classroomio)['org-site']['course'][':courseSlug']['$get'];
type GetPublicCourseSuccess = Extract<InferResponseType<GetPublicCourseRequest>, { success: true }>;

export const load = async ({ params = { slug: '' }, cookies, url }) => {
  const treeResult = await safeServerApi<GetPublicCourseSuccess>(() =>
    classroomio['org-site'].course[':courseSlug'].$get(
      { param: { courseSlug: params.slug } },
      getVisitorHeaders(cookies)
    )
  );

  if (!treeResult.ok && treeResult.status === 401) {
    redirectToSignIn(`${url.pathname}${url.search}`);
  }

  if (!treeResult.ok) {
    throw error(404, 'Public course not found');
  }

  return {
    tree: treeResult.body.data
  };
};
