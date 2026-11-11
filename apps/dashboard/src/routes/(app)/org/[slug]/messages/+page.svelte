<script lang="ts">
  import MessagesPage from '$features/messaging/pages/messages.svelte';
  import { currentOrg } from '$lib/utils/store/org';
</script>

{#key `${$currentOrg.id}:${$currentOrg.roleId}`}
  <MessagesPage />
{/key}
