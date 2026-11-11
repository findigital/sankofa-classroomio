<script lang="ts">
  import { cn } from '../../tools';

  interface Props {
    name?: string;
    href?: string;
    tagline?: string;
    logoAlt?: string;
    class?: string;
  }

  let { name = '', href = '/', tagline = '', logoAlt = '', class: className }: Props = $props();

  const alt = $derived(logoAlt || name || 'Logo');
</script>

<div
  class={cn(
    'ui:absolute ui:top-2 ui:flex ui:flex-col ui:items-center ui:rounded-md ui:border ui:border-dashed ui:px-4 ui:py-1',
    className
  )}
>
  <a {href} class="ui:flex ui:items-center ui:justify-center ui:gap-2">
    <img src="/logo-512.png" class="ui:h-7 ui:w-7" {alt} />
    {#if name}
      <span class="ui:text-foreground ui:text-md">{name}</span>
    {/if}
  </a>

  {#if tagline}
    <p class="ui:text-muted-foreground ui:text-sm">{tagline}</p>
  {/if}
</div>
