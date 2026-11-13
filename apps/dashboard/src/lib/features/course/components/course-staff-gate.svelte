<script lang="ts">
  import type { Snippet } from 'svelte';
  import { courseApi } from '$features/course/api';
  import { courseViewerRoleId, isCourseStaffViewer } from '$features/course/utils/course-staff-access';
  import { isOrgAdmin } from '$lib/utils/store/org';
  import { profile } from '$lib/utils/store/user';
  import CourseStaffLock from './course-staff-lock.svelte';

  let { title, children }: { title: string; children: Snippet } = $props();

  const allowed = $derived(
    isCourseStaffViewer({
      isOrgAdmin: $isOrgAdmin,
      roleId: courseViewerRoleId($profile.id, courseApi.group.people)
    })
  );
</script>

{#if allowed}
  {@render children()}
{:else}
  <CourseStaffLock {title} />
{/if}
