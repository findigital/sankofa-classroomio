<script lang="ts">
  import type { CourseItem, OrgLandingPageLabels } from '../types';
  import * as Card from '../../../base/card';
  import { Button } from '../../../base/button';
  import { BorderBeam } from '../../animation/border-beam';
  import ClockIcon from '@lucide/svelte/icons/clock';
  import { getCourseTypeLandingMeta, landingCourseActionLabel, landingCoursePriceLabel } from '../landing-page-utils';
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

<Card.Root
  class="ui:group ui:@container ui:relative ui:overflow-hidden ui:bg-[var(--landing-bg)] ui:rounded-3xl ui:p-4 ui:duration-300 ui:h-full ui:border-[var(--landing-border)]/50 {disableCourseLinks
    ? ''
    : 'ui:hover:shadow-xl ui:hover:shadow-primary/5 ui:transition-all'}"
>
  <BorderBeam
    size={120}
    duration={8}
    colorFrom="var(--landing-accent)"
    colorTo="color-mix(in oklab, var(--landing-accent) 65%, white)"
  />
  <div class="ui:flex ui:h-full ui:flex-col ui:@lg:flex-row ui:gap-6">
    {#if course.bannerImage}
      <img
        src={course.bannerImage}
        alt={course.title}
        class="ui:w-full ui:@lg:w-48 ui:@lg:shrink-0 ui:h-48 ui:object-cover ui:rounded-2xl ui:group-hover:scale-[1.02] ui:transition-transform ui:duration-500"
      />
    {/if}
    <Card.Content class="ui:p-2 ui:flex ui:flex-col ui:justify-center ui:flex-1">
      <Card.Title class="ui:text-2xl ui:font-bold ui:mb-2">{course.title}</Card.Title>
      <Card.Description class="ui:mb-6 ui:line-clamp-2">{course.description}</Card.Description>

      <div class="ui:flex ui:items-center ui:gap-4 ui:text-sm ui:font-semibold ui:mb-6">
        {#if course.duration}
          <div
            class="ui:flex ui:items-center ui:gap-1.5 ui:text-[var(--landing-fg-muted)] ui:bg-[var(--landing-card-soft)] ui:px-2.5 ui:py-1 ui:rounded-md"
          >
            <ClockIcon class="ui:size-3.5" />
            <span>{course.duration}</span>
          </div>
        {/if}
        {#if courseTypeMeta}
          {@const TypeIcon = courseTypeMeta.icon}
          <div
            class="ui:flex ui:items-center ui:gap-1.5 ui:text-[var(--landing-fg)] ui:bg-[var(--landing-card-soft)] ui:px-2.5 ui:py-1 ui:rounded-md"
          >
            <TypeIcon class={courseTypeMeta.iconClass} />
            <span>{courseTypeMeta.label}</span>
          </div>
        {/if}
      </div>
      <div class="ui:mt-3">
        <CourseTagPills tags={course.tags} />
      </div>

      <div class="ui:mt-auto ui:flex ui:items-center ui:justify-between">
        {#if priceLabel}<span class="ui:font-black ui:text-lg">{priceLabel}</span>{/if}
        <Button
          {href}
          variant="outline"
          class="ui:rounded-lg ui:font-bold ui:text-sm {disableCourseLinks
            ? 'ui:pointer-events-none'
            : 'ui:hover:bg-[var(--landing-accent)] ui:hover:text-[var(--landing-accent-fg)] ui:group-hover:bg-[var(--landing-accent)] ui:group-hover:text-[var(--landing-accent-fg)] ui:transition-colors'}"
          aria-disabled={disableCourseLinks}
          tabindex={disableCourseLinks ? -1 : undefined}
        >
          {landingCourseActionLabel(course, labels) ?? 'Details'}
        </Button>
      </div>
    </Card.Content>
  </div>
</Card.Root>
