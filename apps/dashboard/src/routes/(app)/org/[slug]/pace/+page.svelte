<script lang="ts">
  import PacePage from '$features/pace/pages/pace.svelte';
  import { currentOrg } from '$lib/utils/store/org';
</script>

{#key `${$currentOrg.id}:${$currentOrg.roleId}`}
  <PacePage />
{/key}
