<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import { CourseTagPills, LandingThemeScope } from '@cio/ui/custom/org-landing-page';

  import { FIELDS } from './fields';

  const { Story } = defineMeta({
    title: 'Molecules/CourseTagPills',
    component: CourseTagPills,
    parameters: {
      layout: 'centered',
      controls: {
        include: FIELDS
      }
    },
    tags: ['autodocs'],
    argTypes: {
      tags: { control: false }
    }
  });

  const tags = [
    { id: 'phase-1', name: 'Year 1', slug: 'year-1', color: '#3B82F6' },
    { id: 'topic-ai', name: 'AI', slug: 'ai', color: '#22C55E' },
    { id: 'topic-finance', name: 'Finance', slug: 'finance', color: '#F59E0B' }
  ];
</script>

<Story name="Default">
  {#snippet template()}
    <LandingThemeScope theme="quartz" class="p-6">
      <CourseTagPills {tags} />
    </LandingThemeScope>
  {/snippet}
</Story>

<Story name="Empty">
  {#snippet template()}
    <LandingThemeScope theme="quartz" class="p-6">
      <CourseTagPills tags={[]} />
    </LandingThemeScope>
  {/snippet}
</Story>

<Story name="Without color">
  {#snippet template()}
    <LandingThemeScope theme="minimal" class="p-6">
      <CourseTagPills tags={[{ id: 'plain', name: 'Workshop', slug: 'workshop' }]} />
    </LandingThemeScope>
  {/snippet}
</Story>
