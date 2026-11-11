<script lang="ts">
  import type { CourseInstructor, CourseLandingPageLabels, OrgLandingPageTheme } from './types';
  import { courseLandingTokens } from './course-landing-page.tokens';
  import EditableLandingSection from './editable-section.svelte';
  import SafeHtmlContent from '../safe-html-content/safe-html-content.svelte';

  interface Props {
    variant: OrgLandingPageTheme;
    instructor: CourseInstructor;
    logoUrl?: string;
    labels?: CourseLandingPageLabels;
  }

  let { variant, instructor, logoUrl: _logoUrl, labels }: Props = $props();

  const t = $derived(courseLandingTokens(variant));

  const people = $derived((instructor.people ?? []).filter((person) => person.name.trim().length > 0));

  function avatarFor(name: string, imgUrl?: string) {
    return imgUrl || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(name);
  }
  const coursesLabel = $derived(
    instructor.coursesNo
      ? (labels?.instructorCoursesLabel?.(instructor.coursesNo) ?? `${instructor.coursesNo} courses on the platform`)
      : null
  );

  const hasName = $derived(people.length > 0 || Boolean(instructor.name?.trim()));
</script>

{#if hasName}
  <EditableLandingSection sectionKey="instructor">
    <section id="instructor" class={t.sectionShell}>
      <div class={t.sectionInner}>
        <div class={t.sectionHeader}>
          <span class={t.eyebrow}>{labels?.instructorEyebrow ?? 'Your instructor'}</span>
          <h2 class={t.heading}>{labels?.instructorHeading ?? 'Taught by a practitioner'}</h2>
          <span class={t.headingRule} aria-hidden="true"></span>
        </div>

        <div class={t.instructorShell}>
          {#if people.length > 0}
            <div class="ui:flex ui:w-full ui:flex-col ui:gap-6">
              {#each people as person, index (`${person.name}-${index}`)}
                <div class="ui:flex ui:items-center ui:gap-4">
                  <img
                    src={avatarFor(person.name, person.imgUrl)}
                    alt={person.name}
                    class="{t.instructorAvatar} ui:size-16 ui:shrink-0 ui:rounded-full ui:object-cover"
                    loading="lazy"
                  />
                  <div>
                    <h3 class={t.instructorName}>{person.name}</h3>
                    {#if person.role}
                      <p class={t.instructorRole}>{person.role}</p>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <div class={t.instructorAvatarWrap}>
              <img
                src={avatarFor(instructor.name, instructor.imgUrl)}
                alt={instructor.name}
                class={t.instructorAvatar}
                loading="lazy"
              />
            </div>

            <div class={t.instructorBodyWrap}>
              <h3 class={t.instructorName}>{instructor.name}</h3>
              {#if instructor.role}
                <p class={t.instructorRole}>{instructor.role}</p>
              {/if}
              {#if coursesLabel}
                <p class={t.instructorMeta}>{coursesLabel}</p>
              {/if}
              {#if instructor.description}
                <div class={t.instructorBody}><SafeHtmlContent content={instructor.description} /></div>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    </section>
  </EditableLandingSection>
{/if}
