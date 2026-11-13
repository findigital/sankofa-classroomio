<script lang="ts">
  import { Empty } from '@cio/ui/custom/empty';
  import * as Page from '@cio/ui/base/page';
  import LockKeyhole from '@lucide/svelte/icons/lock-keyhole';
  import { t } from '$lib/utils/functions/translations';

  let { title }: { title: string } = $props();
</script>

<Page.Root class="mx-auto flex w-[90%] px-4 md:max-w-3xl">
  <Page.Header>
    <Page.HeaderContent>
      <Page.Title>{title}</Page.Title>
    </Page.HeaderContent>
  </Page.Header>
  <Page.Body>
    {#snippet child()}
      <Empty
        title={$t('course.navItem.staff_only.denied_title')}
        description={$t('course.navItem.staff_only.denied_description')}
        icon={LockKeyhole}
        variant="page"
      />
    {/snippet}
  </Page.Body>
</Page.Root>
