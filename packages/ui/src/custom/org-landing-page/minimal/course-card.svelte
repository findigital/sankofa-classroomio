<script lang="ts">
  import type { CourseItem, OrgLandingPageLabels } from '../types';
  import * as Card from '../../../base/card';
  import ClockIcon from '@lucide/svelte/icons/clock';
  import { getCourseTypeLandingMeta, landingCoursePriceLabel } from '../landing-page-utils';
  import CourseTagPills from '../course-tag-pills.svelte';

  interface Props {
    course: CourseItem;
    disableCourseLinks?: boolean;
    labels?: OrgLandingPageLabels;
  }

  let { course, disableCourseLinks = false, labels }: Props = $props();

  const courseTypeMeta = $derived(getCourseTypeLandingMeta(course));

  const href = $derived.by(() => {
    if (disableCourseLinks) return undefined;
    return course.link || (course.slug ? `/course/${course.slug}` : undefined);
  });

  const priceLabel = $derived(landingCoursePriceLabel(course, labels));
</script>

<a
  {href}
  class="ui:block ui:h-full ui:no-underline {disableCourseLinks
    ? 'ui:cursor-default'
    : 'ui:cursor-pointer ui:transition-colors'}"
  aria-disabled={disableCourseLinks}
  tabindex={disableCourseLinks ? -1 : undefined}
>
  <Card.Root
    class="ui:rounded-none ui:overflow-hidden ui:border-[var(--landing-border)]/60 ui:shadow-none ui:h-full ui:p-0 ui:gap-0 {disableCourseLinks
      ? ''
      : 'ui:hover:border-[var(--landing-border)] ui:transition-colors'}"
  >
    {#if course.bannerImage}
      <div class="ui:aspect-video ui:w-full ui:overflow-hidden">
        <img src={course.bannerImage} alt={course.title} class="ui:h-full ui:w-full ui:object-cover" />
      </div>
    {/if}
    <Card.Content class="ui:p-8 ui:flex ui:flex-col ui:flex-1">
      <Card.Title class="ui:text-xl ui:font-normal ui:mb-4">{course.title}</Card.Title>
      <Card.Description class="ui:mb-4 ui:line-clamp-3 ui:text-base ui:leading-relaxed">
        {course.description}
      </Card.Description>
      <div class="ui:mb-6">
        <CourseTagPills tags={course.tags} />
      </div>

      <div class="ui:flex ui:items-center ui:gap-6 ui:text-sm ui:mt-auto">
        {#if course.duration}
          <div class="ui:flex ui:items-center ui:gap-1.5 ui:text-[var(--landing-fg-muted)]">
            <ClockIcon class="ui:size-4" />
            <span>{course.duration}</span>
          </div>
        {/if}
        {#if courseTypeMeta}
          {@const TypeIcon = courseTypeMeta.icon}
          <div class="ui:flex ui:items-center ui:gap-1.5 ui:text-[var(--landing-fg-muted)]">
            <TypeIcon class={courseTypeMeta.iconClass} />
            <span>{courseTypeMeta.label}</span>
          </div>
        {/if}
        {#if priceLabel}
          <div class="ui:ml-auto ui:font-semibold">
            {priceLabel}
          </div>
        {/if}
      </div>
    </Card.Content>
  </Card.Root>
</a>
