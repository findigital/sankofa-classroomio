<script lang="ts">
  import { appBrandName } from '$lib/utils/functions/brand';
  import { OrgAiTutorSettingsPage } from '$features/ai-tutor-settings';
</script>

<svelte:head>
  <title>AI Tutor Settings - {appBrandName()}</title>
</svelte:head>

<OrgAiTutorSettingsPage />
