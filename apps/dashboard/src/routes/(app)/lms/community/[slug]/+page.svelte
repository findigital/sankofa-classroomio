<script lang="ts">
  import { appBrandName } from '$lib/utils/functions/brand';
  import { CommunityQuestionPage } from '$features/community/pages';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';

  let { data } = $props();

  const communityPath = $derived(page.url.pathname.replace(/\/[^/]+$/, ''));
</script>

<svelte:head>
  <title>Question - {appBrandName()}</title>
</svelte:head>

<CommunityQuestionPage slug={data.slug} backHref={resolve(communityPath, {})} />
