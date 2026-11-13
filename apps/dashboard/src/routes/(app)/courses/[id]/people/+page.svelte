<script lang="ts">
  import { PeoplePage } from '$features/course/pages';
  import CourseStaffGate from '$features/course/components/course-staff-gate.svelte';
  import { t } from '$lib/utils/functions/translations';
</script>

<CourseStaffGate title={$t('course.navItems.nav_people')}>
  <PeoplePage />
</CourseStaffGate>
