<script lang="ts">
  import { appInitApi } from '$features/app/init.svelte';
  import AccountLoadNotice from './account-load-notice.svelte';
</script>

{#if appInitApi.error}
  <div class="ui:bg-sidebar ui:border-sidebar-border border-b px-4 py-3 md:hidden">
    <AccountLoadNotice />
  </div>
{/if}
