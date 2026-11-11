<script lang="ts">
  import { appBrandName } from '$lib/utils/functions/brand';
  import { CommunityPage } from '$features/community/pages';
  import { AskCommunityButton } from '$features/community/components';
  import { t } from '$lib/utils/functions/translations';
  import * as Page from '@cio/ui/base/page';
</script>

<svelte:head>
  <title>Community - {appBrandName()}</title>
</svelte:head>

<Page.Root class="w-full">
  <Page.Header>
    <Page.HeaderContent>
      <Page.Title>{$t('community.title')}</Page.Title>
    </Page.HeaderContent>
    <Page.Action>
      <AskCommunityButton />
    </Page.Action>
  </Page.Header>
  <Page.Body>
    {#snippet child()}
      <CommunityPage />
    {/snippet}
  </Page.Body>
</Page.Root>
