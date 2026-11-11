<script lang="ts">
  import CodeIcon from '@lucide/svelte/icons/code';
  import { cn } from '@cio/ui/tools';
  import { sourceOfferUrl } from '$lib/utils/functions/brand';
  import { t } from '$lib/utils/functions/translations';

  let { class: className = '' }: { class?: string } = $props();
</script>

<p class={cn('ui:text-muted-foreground px-4 py-3 text-center text-xs', className)}>
  <a
    class="inline-flex items-center justify-center gap-2 underline"
    href={sourceOfferUrl()}
    rel="noopener noreferrer"
    target="_blank"
  >
    <CodeIcon class="hidden size-4 shrink-0 group-data-[collapsible=icon]:inline" />
    <span class="group-data-[collapsible=icon]:sr-only">{$t('common.source_offer')}</span>
  </a>
</p>
