<script lang="ts">
  import { appBrandName } from '$lib/utils/functions/brand';
  import { MyLearningPage } from '$features/lms/pages';
  import { t } from '$lib/utils/functions/translations';
  import * as Page from '@cio/ui/base/page';
</script>

<svelte:head>
  <title>My Learning - {appBrandName()}</title>
</svelte:head>

<Page.Root class="w-full">
  <Page.Header>
    <Page.HeaderContent>
      <Page.Title>{$t('my_learning.heading')}</Page.Title>
    </Page.HeaderContent>
  </Page.Header>
  <Page.Body>
    {#snippet child()}
      <MyLearningPage />
    {/snippet}
  </Page.Body>
</Page.Root>
