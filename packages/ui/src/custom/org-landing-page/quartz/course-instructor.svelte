<script lang="ts">
  import type { CourseInstructor, CourseLandingPageLabels } from '../types';
  import SafeHtmlContent from '../../safe-html-content/safe-html-content.svelte';
  import QuartzCourseSection from './course-section.svelte';

  interface Props {
    instructor: CourseInstructor;
    logoUrl?: string;
    labels?: CourseLandingPageLabels;
  }

  let { instructor, logoUrl: _logoUrl, labels }: Props = $props();

  const people = $derived((instructor.people ?? []).filter((person) => person.name.trim().length > 0));
  const visible = $derived(
    people.length > 0
      ? people
      : instructor.name.trim()
        ? [{ name: instructor.name, role: instructor.role, imgUrl: instructor.imgUrl }]
        : []
  );

  function avatarFor(name: string, imgUrl?: string) {
    return imgUrl || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(name);
  }
</script>

{#if visible.length > 0}
  <QuartzCourseSection
    id="instructor"
    sectionKey="instructor"
    eyebrow={labels?.instructorEyebrow ?? 'Your instructor'}
    heading={labels?.instructorHeading ?? 'Taught by a practitioner'}
  >
    <div class="ui:flex ui:flex-col ui:gap-5">
      {#each visible as person, index (`${person.name}-${index}`)}
        <div class="ui:flex ui:gap-5">
          <img
            src={avatarFor(person.name, person.imgUrl)}
            alt=""
            class="ui:size-14 ui:shrink-0 ui:rounded-[14px] ui:object-cover"
          />
          <div class="ui:min-w-0">
            <h3
              class="ui:m-0 ui:text-[17px] ui:text-[var(--landing-fg)] ui:[font-weight:var(--landing-heading-weight)] ui:[letter-spacing:var(--landing-heading-tracking)]"
            >
              {person.name}
            </h3>
            {#if person.role}
              <p class="ui:m-0 ui:mt-1 ui:text-[13.5px] ui:text-[var(--landing-fg-muted)]">{person.role}</p>
            {/if}
            {#if people.length === 0 && instructor.coursesNo}
              <p class="ui:m-0 ui:mt-1 ui:text-[13.5px] ui:text-[var(--landing-fg-faint)]">
                {labels?.instructorCoursesLabel?.(instructor.coursesNo) ??
                  `${instructor.coursesNo} ${instructor.coursesNo === 1 ? 'course' : 'courses'}`}
              </p>
            {/if}
            {#if people.length === 0 && instructor.description}
              <div
                class="ui:mt-3 ui:max-w-[62ch] ui:text-[15px] ui:leading-relaxed ui:text-[var(--landing-fg-muted)] ui:[&_p]:m-0 ui:[&_p+p]:mt-2"
              >
                <SafeHtmlContent content={instructor.description} />
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </QuartzCourseSection>
{/if}
