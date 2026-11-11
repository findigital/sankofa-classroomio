<script lang="ts">
  import { appBrandName } from '$lib/utils/functions/brand';
  import { EmailsPage } from '$features/settings/pages';
  import { t } from '$lib/utils/functions/translations';
</script>

<svelte:head>
  <title>{$t('settings.emails.page_title')} - {appBrandName()}</title>
</svelte:head>

<EmailsPage />
