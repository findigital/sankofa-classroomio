<script lang="ts">
  import { CourseAiTutorSettingsPage } from '$features/ai-tutor-settings';
  import CourseStaffGate from '$features/course/components/course-staff-gate.svelte';
  import { t } from '$lib/utils/functions/translations';

  let { data } = $props();
</script>

<CourseStaffGate title={$t('course.navItems.nav_ai_tutor')}>
  <CourseAiTutorSettingsPage courseId={data.courseId} />
</CourseStaffGate>
