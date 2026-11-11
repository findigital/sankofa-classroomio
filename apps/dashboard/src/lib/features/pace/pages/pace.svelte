<script lang="ts">
  import { onDestroy } from 'svelte';

  import { Badge } from '@cio/ui/base/badge';
  import { Button } from '@cio/ui/base/button';
  import * as Page from '@cio/ui/base/page';
  import * as Select from '@cio/ui/base/select';
  import * as Table from '@cio/ui/base/table';
  import { NumberField } from '@cio/ui/custom/number-field';
  import { Skeleton } from '@cio/ui/base/skeleton';
  import { ROLE } from '@cio/utils/constants';

  import MentorDialog from '$features/pace/components/mentor-dialog.svelte';
  import SafeguardingDialog from '$features/pace/components/safeguarding-dialog.svelte';
  import { paceApi } from '$features/pace/api/pace.svelte';
  import { paceActivityAge } from '$features/pace/utils/pace-utils';
  import type { FellowPaceFellow } from '$features/pace/utils/types';
  import { t } from '$lib/utils/functions/translations';
  import { currentOrg } from '$lib/utils/store/org';

  let cohortId = $state('all');
  let courseId = $state('all');
  let quietDays = $state(14);
  let quietDaysTouched = false;
  let loadedOrgId = '';
  let loadedRoleId = 0;
  let quietTimer: ReturnType<typeof setTimeout> | undefined;
  let mentorOpen = $state(false);
  let safeguardingOpen = $state(false);
  let safeguardingMemberId = $state(0);
  let safeguardingName = $state('');

  function paceQuery(days = quietDays) {
    return {
      cohortId: cohortId === 'all' ? undefined : cohortId,
      courseId: courseId === 'all' ? undefined : courseId,
      quietDays: days
    };
  }

  function handleCohortChange(value: string) {
    cohortId = value;
    void paceApi.loadPace(paceQuery());
  }

  function handleCourseChange(value: string) {
    courseId = value;
    void paceApi.loadPace(paceQuery());
  }

  function handleQuietDays(value: number | null) {
    quietDaysTouched = true;
    const next = value != null && value >= 1 && value <= 365 ? value : 14;
    quietDays = next;
    clearTimeout(quietTimer);
    quietTimer = setTimeout(() => {
      void paceApi.loadPace(paceQuery(next));
    }, 400);
  }

  function openSafeguarding(fellow: FellowPaceFellow) {
    safeguardingMemberId = fellow.memberId;
    safeguardingName = fellow.name;
    safeguardingOpen = true;
  }

  $effect(() => {
    const organizationId = $currentOrg.id;
    const roleId = $currentOrg.roleId;

    if (!organizationId || !roleId) return;
    if (organizationId === loadedOrgId && roleId === loadedRoleId) return;

    loadedOrgId = organizationId;
    loadedRoleId = roleId;

    if (roleId !== ROLE.ADMIN && roleId !== ROLE.TUTOR) {
      paceApi.fellows = [];
      return;
    }

    void paceApi.loadPace({}).then(() => {
      if (quietDaysTouched) return;

      quietDays = paceApi.quietDays;
    });
  });

  onDestroy(() => clearTimeout(quietTimer));
</script>

<svelte:head>
  <title>{$t('pace.page_title')}</title>
</svelte:head>

<Page.Root class="w-full">
  <Page.Header>
    <Page.HeaderContent>
      <Page.Title>{$t('pace.heading')}</Page.Title>
      <Page.Subtitle>{$t('pace.subtitle', { days: paceApi.quietDays })}</Page.Subtitle>
    </Page.HeaderContent>
    {#if $currentOrg.roleId === ROLE.ADMIN}
      <Page.Action>
        <Button testId="pace-assign-mentors" onclick={() => (mentorOpen = true)}>
          {$t('pace.mentors.open')}
        </Button>
      </Page.Action>
    {/if}
  </Page.Header>

  <Page.Body>
    {#if $currentOrg.roleId === ROLE.STUDENT}
      <p>{$t('pace.forbidden')}</p>
    {:else}
      <div class="mb-4 grid gap-3 md:grid-cols-3">
        <Select.Root type="single" value={cohortId} onValueChange={handleCohortChange}>
          <Select.Trigger class="w-full" data-testid="pace-cohort-filter">
            {cohortId === 'all'
              ? $t('pace.filters.all_cohorts')
              : (paceApi.cohorts.find((cohort) => cohort.id === cohortId)?.name ?? $t('pace.filters.all_cohorts'))}
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="all">{$t('pace.filters.all_cohorts')}</Select.Item>
            {#each paceApi.cohorts as cohort (cohort.id)}
              <Select.Item value={cohort.id}>{cohort.name}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>

        <Select.Root type="single" value={courseId} onValueChange={handleCourseChange}>
          <Select.Trigger class="w-full" data-testid="pace-course-filter">
            {courseId === 'all'
              ? $t('pace.filters.all_courses')
              : (paceApi.courses.find((course) => course.id === courseId)?.title ?? $t('pace.filters.all_courses'))}
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="all">{$t('pace.filters.all_courses')}</Select.Item>
            {#each paceApi.courses as course (course.id)}
              <Select.Item value={course.id}>{course.title}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>

        <NumberField
          integer
          min={1}
          max={365}
          label={$t('pace.filters.quiet_days')}
          testId="pace-quiet-days"
          bind:value={quietDays}
          onValueChange={handleQuietDays}
        />
      </div>

      {#if paceApi.fellows === null}
        <div class="space-y-2">
          {#each [0, 1, 2, 3, 4] as index (index)}
            <Skeleton class="h-12 w-full" />
          {/each}
        </div>
      {:else if paceApi.fellows.length === 0}
        <p>{$t('pace.empty')}</p>
      {:else}
        <div class="overflow-x-auto">
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.Head>{$t('pace.columns.fellow')}</Table.Head>
                <Table.Head>{$t('pace.columns.mentors')}</Table.Head>
                <Table.Head>{$t('pace.columns.last_activity')}</Table.Head>
                <Table.Head>{$t('pace.columns.lessons')}</Table.Head>
                <Table.Head>{$t('pace.columns.exercises')}</Table.Head>
                <Table.Head>{$t('pace.columns.overdue')}</Table.Head>
                <Table.Head>{$t('pace.columns.flags')}</Table.Head>
                <Table.Head>{$t('pace.columns.minor')}</Table.Head>
                {#if $currentOrg.roleId === ROLE.ADMIN}
                  <Table.Head></Table.Head>
                {/if}
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#each paceApi.fellows as fellow (fellow.memberId)}
                {@const activity = paceActivityAge(fellow.lastActivityAt)}
                <Table.Row>
                  <Table.Cell>
                    <p class="font-medium">{fellow.name}</p>
                    <p class="ui:text-muted-foreground text-sm">{fellow.email}</p>
                  </Table.Cell>
                  <Table.Cell>
                    {fellow.mentors.length > 0
                      ? fellow.mentors.map((mentor) => mentor.name).join(', ')
                      : $t('pace.mentors.unassigned')}
                  </Table.Cell>
                  <Table.Cell>
                    {#if activity.kind === 'never'}
                      {$t('pace.last_activity_never')}
                    {:else if activity.kind === 'today'}
                      {$t('pace.last_activity_today')}
                    {:else}
                      {$t('pace.last_activity_days', { days: activity.days })}
                    {/if}
                  </Table.Cell>
                  <Table.Cell>
                    {$t('pace.ratio', { completed: fellow.lessonsCompleted, required: fellow.lessonsRequired })}
                  </Table.Cell>
                  <Table.Cell>
                    {$t('pace.ratio', { completed: fellow.exercisesCompleted, required: fellow.exercisesRequired })}
                  </Table.Cell>
                  <Table.Cell>
                    <p>{fellow.overdueCount}</p>
                    {#each fellow.overdueItems.slice(0, 3) as item (item.exerciseId)}
                      <p class="ui:text-muted-foreground text-sm">{item.title}</p>
                    {/each}
                  </Table.Cell>
                  <Table.Cell>
                    <div class="flex flex-wrap gap-1">
                      {#if fellow.flags.length === 0}
                        <Badge variant="success">{$t('pace.flags.on_pace')}</Badge>
                      {/if}
                      {#if fellow.flags.includes('gone_quiet')}
                        <Badge variant="warning">{$t('pace.flags.gone_quiet')}</Badge>
                      {/if}
                      {#if fellow.flags.includes('overdue')}
                        <Badge variant="destructive">{$t('pace.flags.overdue')}</Badge>
                      {/if}
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    {fellow.isMinor ? $t('pace.minor_yes') : $t('pace.minor_no')}
                  </Table.Cell>
                  {#if $currentOrg.roleId === ROLE.ADMIN}
                    <Table.Cell>
                      <Button size="sm" variant="outline" onclick={() => openSafeguarding(fellow)}>
                        {$t('pace.safeguarding.open')}
                      </Button>
                    </Table.Cell>
                  {/if}
                </Table.Row>
              {/each}
            </Table.Body>
          </Table.Root>
        </div>
      {/if}
    {/if}
  </Page.Body>
</Page.Root>

{#if $currentOrg.roleId === ROLE.ADMIN}
  <MentorDialog bind:open={mentorOpen} onSaved={() => paceApi.loadPace(paceQuery())} />
  <SafeguardingDialog bind:open={safeguardingOpen} memberId={safeguardingMemberId} fellowName={safeguardingName} />
{/if}
