<script lang="ts">
  import * as Block from '@cio/ui/custom/block';
  import { SafeHtmlContent } from '@cio/ui/custom/safe-html-content';
  import HTMLRender from '$features/ui/html-render.svelte';

  interface Props {
    html?: string;
  }

  let { html = '' }: Props = $props();
</script>

{#if html.trim()}
  <div class="mb-6">
    <Block.Note editable={false} contentHtml={html}>
      {#snippet view()}
        <HTMLRender>
          <SafeHtmlContent content={html} />
        </HTMLRender>
      {/snippet}
    </Block.Note>
  </div>
{/if}
