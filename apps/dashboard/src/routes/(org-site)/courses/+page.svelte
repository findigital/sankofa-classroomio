<script lang="ts">
  import { afterNavigate, goto } from '$app/navigation';
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import { onDestroy, untrack } from 'svelte';
  import { SvelteSet, SvelteURLSearchParams } from 'svelte/reactivity';

  import { t } from '$lib/utils/functions/translations';
  import { user, profile } from '$lib/utils/store/user';

  import { appInitApi } from '$features/app/init.svelte';
  import { resolveOrgLandingAuthAction } from '$features/org/utils/org-landing-auth-action';
  import { resolveOrgLandingLearnerAccount } from '$features/org/utils/org-landing-learner-account';
  import LibraryBigIcon from '@lucide/svelte/icons/library-big';
  import XIcon from '@lucide/svelte/icons/x';
  import FilterIcon from '@lucide/svelte/icons/filter';
  import { normalizeLandingPageSettings, themeRendersNavInsideHero } from '$features/org/utils/landing-page';

  import { LandingButton, LandingThemeScope, OrgLandingPageFooter } from '@cio/ui/custom/org-landing-page';

  import { Input } from '@cio/ui/base/input';
  import { DebouncedSearch } from '$lib/utils/functions/debounced-search.svelte';
  import { Empty } from '@cio/ui/custom/empty';
  import * as Pagination from '@cio/ui/base/pagination';
  import * as Sheet from '@cio/ui/base/sheet';

  let { data } = $props();

  let pendingFilters = $state<{ tags: string[]; types: string[]; pricing: 'free' | 'paid' | null } | null>(null);

  function toPricingFilter(value: unknown): 'free' | 'paid' | null {
    return value === 'free' || value === 'paid' ? value : null;
  }

  let selectedTags = $derived<string[]>(pendingFilters?.tags ?? data.activeTags ?? []);
  let selectedTypes = $derived<string[]>(pendingFilters?.types ?? data.activeTypes ?? []);
  let activeSearch = $derived(data.activeSearch || '');
  let activePricing = $derived<'free' | 'paid' | undefined>(
    pendingFilters ? (pendingFilters.pricing ?? undefined) : (toPricingFilter(data.activePricing) ?? undefined)
  );

  $effect(() => {
    if (!pendingFilters) return;

    const serverTags = [...(data.activeTags ?? [])].sort();
    const serverTypes = [...(data.activeTypes ?? [])].sort();
    const serverPricing = toPricingFilter(data.activePricing);
    const pending = pendingFilters;
    if (
      JSON.stringify([...pending.tags].sort()) === JSON.stringify(serverTags) &&
      JSON.stringify([...pending.types].sort()) === JSON.stringify(serverTypes) &&
      pending.pricing === serverPricing
    ) {
      pendingFilters = null;
    }
  });

  const search = new DebouncedSearch({
    initial: untrack(() => activeSearch),
    onApply: (nextSearch) => void applyFilters({ search: nextSearch })
  });

  afterNavigate(() => {
    search.sync(activeSearch);
  });

  onDestroy(() => {
    search.destroy();
  });
  let filterSheetOpen = $state(false);

  const COURSE_TYPES = [
    { value: 'SELF_PACED', label: t.get('analytics.popularTypes.types.SELF_PACED') },
    { value: 'LIVE_CLASS', label: t.get('analytics.popularTypes.types.LIVE_CLASS') },
    { value: 'COMPLIANCE', label: t.get('analytics.popularTypes.types.COMPLIANCE') },
    { value: 'PUBLIC', label: t.get('analytics.popularTypes.types.PUBLIC') }
  ] as const;

  const landingSettings = $derived(normalizeLandingPageSettings(data.org.landingpage));
  const signInHref = $derived(`/login?redirect=${encodeURIComponent(`${page.url.pathname}${page.url.search}`)}`);

  const authAction = $derived(
    resolveOrgLandingAuthAction({
      org: data.org,
      locals: data.locals,
      user: $user,
      appInitApi
    })
  );

  const learnerAccount = $derived(
    resolveOrgLandingLearnerAccount({
      org: data.org,
      locals: data.locals,
      user: $user,
      profile: $profile,
      appInitApi
    })
  );

  const navInsideHero = $derived(themeRendersNavInsideHero(landingSettings.theme));

  const NavComponent = $derived(data.theme.Nav);
  const HeroComponent = $derived(data.theme.Hero);
  const CourseCardComponent = $derived(data.theme.CourseCard);
  const courseGridClass = $derived(data.theme.coursesGridClass);
  const cardLabels = $derived({
    hidePrice: data.hideCoursePricing,
    freeLabel: $t('course.navItem.landing_page.pricing_section.free')
  });

  const heroProps = $derived({
    ...landingSettings.hero,
    heading: t.get('public_courses.heading'),
    image: ''
  });

  const activeFilterCount = $derived(selectedTags.length + selectedTypes.length + (activePricing ? 1 : 0));

  async function applyFilters(next: {
    tags?: string[];
    types?: string[];
    search?: string;
    pricing?: 'free' | 'paid' | null;
  }) {
    const params = new SvelteURLSearchParams(page.url.searchParams);
    const nextTags = next.tags ?? selectedTags;
    const nextTypes = next.types ?? selectedTypes;
    const nextSearch = next.search !== undefined ? next.search : activeSearch;
    const nextPricing = 'pricing' in next ? next.pricing : activePricing;

    nextTags.length ? params.set('tags', nextTags.join(',')) : params.delete('tags');
    nextTypes.length ? params.set('types', nextTypes.join(',')) : params.delete('types');
    nextSearch ? params.set('search', nextSearch) : params.delete('search');
    nextPricing ? params.set('pricing', nextPricing) : params.delete('pricing');
    params.delete('page');

    const query = params.toString();
    const suffix = query ? `?${query}` : '';

    await goto(resolve(`/courses${suffix}`, {}), {
      keepFocus: true,
      noScroll: true,
      invalidateAll: true
    });
  }

  async function goToPage(nextPage: number) {
    if (nextPage === data.pagination.page) {
      return;
    }

    const params = new SvelteURLSearchParams(page.url.searchParams);
    const pendingSearch = search.takePending();
    pendingSearch ? params.set('search', pendingSearch) : params.delete('search');

    if (nextPage > 1) {
      params.set('page', String(nextPage));
    } else {
      params.delete('page');
    }

    const query = params.toString();
    const suffix = query ? `?${query}` : '';

    await goto(resolve(`/courses${suffix}`, {}), { invalidateAll: true });
  }

  function currentPendingPricing(): 'free' | 'paid' | null {
    return pendingFilters ? pendingFilters.pricing : toPricingFilter(data.activePricing);
  }

  function toggleTag(tagSlug: string, checked: boolean) {
    const next = new SvelteSet(selectedTags);
    if (checked) {
      next.add(tagSlug);
    } else {
      next.delete(tagSlug);
    }

    pendingFilters = { tags: Array.from(next), types: selectedTypes, pricing: currentPendingPricing() };
    applyFilters({ tags: Array.from(next), search: search.takePending() });
  }

  function toggleType(typeValue: string, checked: boolean) {
    const next = new SvelteSet(selectedTypes);
    if (checked) {
      next.add(typeValue);
    } else {
      next.delete(typeValue);
    }

    pendingFilters = { tags: selectedTags, types: Array.from(next), pricing: currentPendingPricing() };
    applyFilters({ types: Array.from(next), search: search.takePending() });
  }

  function togglePricing(nextPricing: 'free' | 'paid' | null) {
    pendingFilters = { tags: selectedTags, types: selectedTypes, pricing: nextPricing };
    applyFilters({ pricing: nextPricing, search: search.takePending() });
  }

  function clearFilters() {
    if (selectedTags.length === 0 && selectedTypes.length === 0 && !activeSearch && !activePricing) {
      return;
    }

    search.reset();
    pendingFilters = { tags: [], types: [], pricing: null };
    applyFilters({ tags: [], types: [], search: '', pricing: null });
  }

  function onSearchInput(value: string) {
    search.input(value);
  }

  function onSearchKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      search.flush();
    }
  }

  function isTagSelected(tagSlug: string) {
    return selectedTags.includes(tagSlug);
  }

  const displayTagGroups = $derived.by(() => {
    const sourceGroups = data.tagGroups ?? [];
    const tagsByGroupId: Record<string, (typeof sourceGroups)[number]['tags']> = {};

    for (const group of sourceGroups) {
      for (const tag of group.tags ?? []) {
        const groupId = tag.groupId || group.id;
        const existing = tagsByGroupId[groupId] ?? [];

        if (!existing.some((item) => item.id === tag.id)) {
          existing.push(tag);
          tagsByGroupId[groupId] = existing;
        }
      }
    }

    return sourceGroups.map((group) => ({
      ...group,
      tags: tagsByGroupId[group.id] ?? []
    }));
  });

  const hasActiveFilters = $derived(
    selectedTags.length > 0 || selectedTypes.length > 0 || !!activeSearch || !!activePricing
  );

  const visibleCourseTypes = $derived(
    data.showCourseTypeFilter
      ? COURSE_TYPES.filter((courseType) =>
          (data.courseTypeCounts ?? []).some((row) => row.type === courseType.value && row.count > 0)
        )
      : []
  );

  const hasFilterOptions = $derived(
    displayTagGroups.some((group) => group.tags.length > 0) || visibleCourseTypes.length > 0 || !data.hideCoursePricing
  );
</script>

{#snippet searchField()}
  <div class="relative mx-auto w-full max-w-xl">
    <Input
      type="text"
      value={search.draft}
      oninput={(e) => onSearchInput(e.currentTarget.value)}
      onkeydown={onSearchKeydown}
      placeholder={$t('public_courses.filters.search_placeholder')}
      class="ui:text-foreground pr-8!"
    />
    {#if search.draft}
      <button
        type="button"
        onclick={() => search.input('')}
        class="ui:text-muted-foreground ui:hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
        aria-label={$t('public_courses.filters.clear_search')}
      >
        <XIcon class="size-4" />
      </button>
    {/if}
  </div>
{/snippet}

{#snippet filterChip(label: string, pressed: boolean, onclick: () => void)}
  <button
    type="button"
    aria-pressed={pressed}
    {onclick}
    class="inline-flex items-center rounded-full border px-3 py-1 text-sm transition-colors {pressed
      ? 'ui:border-primary ui:bg-primary ui:text-primary-foreground'
      : 'ui:border-border ui:bg-background ui:text-foreground ui:hover:bg-muted'}"
  >
    {label}
  </button>
{/snippet}

{#snippet filtersContent()}
  <div class="flex flex-col gap-5" data-testid="catalog-filter-bar">
    {#if visibleCourseTypes.length > 0}
      <div class="space-y-2">
        <h3 class="text-sm font-semibold tracking-wide uppercase">{$t('public_courses.filters.types_title')}</h3>
        <div class="flex flex-wrap gap-2">
          {#each visibleCourseTypes as courseType (courseType.value)}
            {@render filterChip(courseType.label, selectedTypes.includes(courseType.value), () =>
              toggleType(courseType.value, !selectedTypes.includes(courseType.value))
            )}
          {/each}
        </div>
      </div>
    {/if}

    {#each displayTagGroups as group (group.id)}
      {#if group.tags.length > 0}
        <div class="space-y-2">
          <h3 class="text-sm font-semibold tracking-wide uppercase">{group.name}</h3>
          <div class="flex flex-wrap gap-2">
            {#each group.tags as tag (tag.id)}
              {@render filterChip(tag.name, isTagSelected(tag.slug), () =>
                toggleTag(tag.slug, !isTagSelected(tag.slug))
              )}
            {/each}
          </div>
        </div>
      {/if}
    {/each}

    {#if !data.hideCoursePricing}
      <div class="space-y-2">
        <h3 class="text-sm font-semibold tracking-wide uppercase">{$t('public_courses.filters.pricing_title')}</h3>
        <div class="flex flex-wrap gap-2">
          {#each [{ value: 'free' as const, label: $t('public_courses.filters.pricing_free') }, { value: 'paid' as const, label: $t('public_courses.filters.pricing_paid') }] as option (option.value)}
            {@render filterChip(option.label, activePricing === option.value, () =>
              togglePricing(activePricing === option.value ? null : option.value)
            )}
          {/each}
        </div>
      </div>
    {/if}
  </div>
{/snippet}

<LandingThemeScope theme={landingSettings.theme} class="font-sans">
  <main>
    {#if navInsideHero}
      <HeroComponent hero={heroProps} orgName={data.org.name} showActions={false} compact={true}>
        {#snippet navigation()}
          <NavComponent
            orgName={data.org.name}
            logoUrl={data.org.avatarUrl ?? undefined}
            navItems={landingSettings.navItems}
            {authAction}
            {learnerAccount}
          />
        {/snippet}
        {#snippet children()}
          {@render searchField()}
        {/snippet}
      </HeroComponent>
    {:else}
      <NavComponent
        orgName={data.org.name}
        logoUrl={data.org.avatarUrl ?? undefined}
        navItems={landingSettings.navItems}
        {authAction}
        {learnerAccount}
      />
      <HeroComponent hero={heroProps} orgName={data.org.name} showActions={false} compact={true}>
        {#snippet children()}
          {@render searchField()}
        {/snippet}
      </HeroComponent>
    {/if}

    <section class="mx-auto w-full max-w-7xl px-4 py-8 md:px-6">
      {#if data.catalogLocked}
        <Empty
          icon={LibraryBigIcon}
          title={$t('public_courses.catalog_locked.title')}
          description={$t('public_courses.catalog_locked.description')}
          variant="page"
        >
          {#if data.showSignIn}
            <LandingButton href={signInHref}>
              {$t('public_courses.catalog_locked.sign_in')}
            </LandingButton>
          {/if}
        </Empty>
      {:else}
        <div class="mb-6 flex items-center justify-between gap-3 lg:hidden">
          {#if hasFilterOptions}
            <LandingButton variant="secondary" onclick={() => (filterSheetOpen = true)}>
              <FilterIcon class="size-4" />
              {$t('public_courses.filters.title')}
              {#if activeFilterCount > 0}
                <span
                  class="ui:bg-primary ui:text-primary-foreground ml-1 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs"
                >
                  {activeFilterCount}
                </span>
              {/if}
            </LandingButton>
          {/if}

          <div class="ml-auto">
            <LandingButton variant="secondary" onclick={clearFilters} disabled={!hasActiveFilters}>
              {$t('public_courses.clear_filters')}
            </LandingButton>
          </div>
        </div>

        <div class="grid grid-cols-1 gap-6 lg:gap-8 {hasFilterOptions ? 'lg:grid-cols-[280px_minmax(0,1fr)]' : ''}">
          {#if hasFilterOptions}
            <aside
              class="hidden self-start rounded-lg border border-(--landing-border) bg-(--landing-card) p-4 text-(--landing-fg) lg:block"
              data-testid="catalog-filter-card"
            >
              <h2 class="text-base font-semibold">{$t('public_courses.filters.title')}</h2>
              <p class="ui:text-muted-foreground mb-4 text-xs">{$t('public_courses.filters.help')}</p>
              {@render filtersContent()}
              <div class="mt-4">
                <LandingButton variant="secondary" onclick={clearFilters} disabled={!hasActiveFilters}>
                  {$t('public_courses.clear_filters')}
                </LandingButton>
              </div>
            </aside>
          {/if}

          <div class="ui:@container min-w-0 space-y-4">
            {#if data.courses.length === 0}
              <Empty
                icon={LibraryBigIcon}
                title={$t('public_courses.empty.title')}
                description={$t('public_courses.empty.description')}
                variant="page"
              />
            {:else}
              <div class={courseGridClass}>
                {#each data.courses as course, index (course.id)}
                  <CourseCardComponent {course} {index} labels={cardLabels} />
                {/each}
              </div>

              {#if data.pagination.totalPages > 1}
                <Pagination.Root
                  count={data.pagination.total}
                  perPage={data.pagination.perPage}
                  page={data.pagination.page}
                  onPageChange={goToPage}
                  class="mt-8"
                >
                  {#snippet children({ pages, currentPage })}
                    <Pagination.Content>
                      <Pagination.Item>
                        <Pagination.PrevButton />
                      </Pagination.Item>
                      {#each pages as pageItem (pageItem.key)}
                        {#if pageItem.type === 'ellipsis'}
                          <Pagination.Item>
                            <Pagination.Ellipsis />
                          </Pagination.Item>
                        {:else}
                          <Pagination.Item>
                            <Pagination.Link page={pageItem} isActive={currentPage === pageItem.value}>
                              {pageItem.value}
                            </Pagination.Link>
                          </Pagination.Item>
                        {/if}
                      {/each}
                      <Pagination.Item>
                        <Pagination.NextButton />
                      </Pagination.Item>
                    </Pagination.Content>
                  {/snippet}
                </Pagination.Root>
              {/if}
            {/if}
          </div>
        </div>
      {/if}
    </section>

    <!-- Mobile filter sheet -->
    <Sheet.Root bind:open={filterSheetOpen}>
      <Sheet.Content side="right" portalProps={{ disabled: true }} class="flex w-full flex-col p-0 sm:max-w-md">
        <Sheet.Header class="border-b">
          <Sheet.Title>{$t('public_courses.filters.title')}</Sheet.Title>
          <Sheet.Description>
            {$t('public_courses.filters.selected')}
            <span
              class="ui:bg-muted ui:text-foreground ml-1 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-medium"
            >
              {activeFilterCount}
            </span>
          </Sheet.Description>
        </Sheet.Header>

        <div class="min-h-0 flex-1 overflow-y-auto p-4">
          {@render filtersContent()}
        </div>

        <div class="flex gap-3 border-t p-4">
          <LandingButton variant="secondary" class="flex-1" onclick={clearFilters}>
            {$t('public_courses.clear_filters')}
          </LandingButton>
          <LandingButton class="flex-1" onclick={() => (filterSheetOpen = false)}
            >{$t('public_courses.filters.save_changes')}</LandingButton
          >
        </div>
      </Sheet.Content>
    </Sheet.Root>

    <OrgLandingPageFooter
      orgName={data.org.name}
      logoUrl={data.org.avatarUrl ?? undefined}
      footer={landingSettings.footer}
      variant={landingSettings.theme}
    />
  </main>
</LandingThemeScope>
