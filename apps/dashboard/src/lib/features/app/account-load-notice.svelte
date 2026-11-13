<script lang="ts">
  import { appInitApi } from '$features/app/init.svelte';

  let { class: className = '' }: { class?: string } = $props();
</script>

{#if appInitApi.error}
  <p class="text-sm {className}">{appInitApi.error}</p>
{/if}
