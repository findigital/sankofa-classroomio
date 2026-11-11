<script>
  import { appBrandName } from '$lib/utils/functions/brand';
  import { TeamsPage } from '$features/settings/pages';
</script>

<svelte:head>
  <title>Teams - {appBrandName()}</title>
</svelte:head>

<TeamsPage />
