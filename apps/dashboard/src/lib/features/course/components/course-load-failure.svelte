<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { Button } from '@cio/ui/base/button';
  import { Empty } from '@cio/ui/custom/empty';
  import * as Page from '@cio/ui/base/page';
  import RotateCw from '@lucide/svelte/icons/rotate-cw';
  import { t } from '$lib/utils/functions/translations';
  import type { CourseLoadFailure } from '$lib/utils/services/api/load-failure';

  let { failure }: { failure: CourseLoadFailure } = $props();

  const title = $derived(
    failure === 'rate_limited'
      ? $t('course.navItem.load_failure.rate_limited_title')
      : $t('course.navItem.load_failure.unavailable_title')
  );
  const description = $derived(
    failure === 'rate_limited'
      ? $t('course.navItem.load_failure.rate_limited_description')
      : $t('course.navItem.load_failure.unavailable_description')
  );
</script>

<Page.Root class="mx-auto flex w-[90%] px-4 md:max-w-3xl">
  <Page.Body>
    {#snippet child()}
      <Empty {title} {description} icon={RotateCw} variant="page">
        <Button onclick={() => invalidateAll()}>{$t('course.navItem.load_failure.retry')}</Button>
      </Empty>
    {/snippet}
  </Page.Body>
</Page.Root>
