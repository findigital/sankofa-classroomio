<script>
  import { appBrandName } from '$lib/utils/functions/brand';
  import { DomainsPage } from '$features/settings/pages';
</script>

<svelte:head>
  <title>Custom domain - {appBrandName()}</title>
</svelte:head>

<DomainsPage />
