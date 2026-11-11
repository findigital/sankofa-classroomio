<script lang="ts">
  import { dndzone } from 'svelte-dnd-action';
  import GripVerticalIcon from '@lucide/svelte/icons/grip-vertical';

  import { orgApi } from '$features/org/api/org.svelte';
  import type { CatalogOrderCourses } from '$features/org/utils/types';
  import { t } from '$lib/utils/functions/translations';
  import { currentOrg, isOrgAdmin } from '$lib/utils/store/org';
  import * as Page from '@cio/ui/base/page';
  import { Skeleton } from '@cio/ui/base/skeleton';

  type OrderedCourse = CatalogOrderCourses[number] & { id: string };

  const FLIP_DURATION_MS = 200;

  let courses = $state<OrderedCourse[]>([]);
  let savedIds = $state<string[]>([]);
  let isLoading = $state(true);
  let isSaving = $state(false);
  let loadedOrgId = '';

  const hasChanges = $derived(courses.map((course) => course.id).join() !== savedIds.join());

  function applyCourses(nextCourses: CatalogOrderCourses) {
    courses = nextCourses.map((course) => ({ ...course, id: course.id }));
    savedIds = courses.map((course) => course.id);
  }

  async function loadCourses(organizationId: string) {
    isLoading = true;
    const listed = await orgApi.listCatalogOrder();

    if (organizationId !== $currentOrg.id) return;

    applyCourses(listed);
    isLoading = false;
  }

  $effect(() => {
    const organizationId = $currentOrg.id;
    if (!organizationId || !$isOrgAdmin || organizationId === loadedOrgId) return;

    loadedOrgId = organizationId;
    void loadCourses(organizationId);
  });

  function handleConsider(event: CustomEvent<{ items: OrderedCourse[] }>) {
    courses = event.detail.items;
  }

  function handleFinalize(event: CustomEvent<{ items: OrderedCourse[] }>) {
    courses = event.detail.items;
  }

  function handleDiscard() {
    const order = new Map(savedIds.map((id, index) => [id, index]));
    courses = [...courses].sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0));
  }

  async function handleSave() {
    if (!hasChanges || courses.length === 0) return;

    isSaving = true;
    const orders = courses.map((course, index) => ({ id: course.id, order: index }));
    const saved = await orgApi.saveCatalogOrder(orders);
    isSaving = false;

    if (!saved) return;

    savedIds = courses.map((course) => course.id);
  }
</script>

<svelte:head>
  <title>{$t('courses.catalog_order.title')}</title>
</svelte:head>

<Page.Root>
  <Page.Header>
    <Page.HeaderContent>
      <Page.Title>{$t('courses.catalog_order.title')}</Page.Title>
      <Page.Subtitle>{$t('courses.catalog_order.description')}</Page.Subtitle>
    </Page.HeaderContent>
  </Page.Header>

  <Page.Body>
    {#if !$isOrgAdmin}
      <p class="ui:text-muted-foreground text-sm">{$t('courses.catalog_order.admin_only')}</p>
    {:else if isLoading}
      <div class="flex max-w-2xl flex-col gap-2">
        {#each [0, 1, 2] as index (index)}
          <Skeleton class="h-12 w-full" />
        {/each}
      </div>
    {:else if courses.length === 0}
      <p class="ui:text-muted-foreground text-sm">{$t('courses.catalog_order.empty')}</p>
    {:else}
      <div
        class="flex max-w-2xl flex-col gap-2"
        use:dndzone={{ items: courses, flipDurationMs: FLIP_DURATION_MS, dropTargetStyle: {} }}
        onconsider={handleConsider}
        onfinalize={handleFinalize}
      >
        {#each courses as course, index (course.id)}
          <div class="flex items-center gap-3 rounded-md border px-3 py-2">
            <GripVerticalIcon
              class="ui:text-muted-foreground size-4 shrink-0"
              aria-label={$t('courses.catalog_order.drag')}
            />
            <span class="ui:text-muted-foreground w-6 text-sm">{index + 1}</span>
            <span class="min-w-0 flex-1 truncate text-sm font-medium">{course.title}</span>
            {#if !course.isPublished}
              <span class="ui:text-muted-foreground text-xs">{$t('courses.catalog_order.unpublished')}</span>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </Page.Body>

  <Page.SettingsActions
    {hasChanges}
    loading={isSaving}
    statusLabel={$t('common.unsaved_changes.label')}
    discardLabel={$t('common.discard')}
    saveLabel={$t('common.save_changes')}
    onSave={handleSave}
    onDiscard={handleDiscard}
  />
</Page.Root>
