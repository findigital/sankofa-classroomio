<script lang="ts">
  import type { CourseItem } from './types';

  interface Props {
    tags?: CourseItem['tags'];
    class?: string;
  }

  let { tags = [], class: className = '' }: Props = $props();
</script>

{#if tags && tags.length > 0}
  <ul class="ui:m-0 ui:flex ui:list-none ui:flex-wrap ui:gap-1.5 ui:p-0 {className}">
    {#each tags as tag (tag.id)}
      <li
        class="ui:inline-flex ui:max-w-full ui:items-center ui:gap-1.5 ui:rounded-full ui:border ui:border-[var(--landing-border)] ui:bg-[var(--landing-card)] ui:px-2 ui:py-0.5 ui:text-xs ui:text-[var(--landing-fg)]"
      >
        {#if tag.color}
          <span
            class="ui:inline-block ui:size-2 ui:shrink-0 ui:rounded-full"
            style={`background-color: ${tag.color}`}
            aria-hidden="true"
          ></span>
        {/if}
        <span class="ui:truncate">{tag.name}</span>
      </li>
    {/each}
  </ul>
{/if}
