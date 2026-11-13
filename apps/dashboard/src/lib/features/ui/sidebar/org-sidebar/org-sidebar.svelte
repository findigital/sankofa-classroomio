<script lang="ts">
  import * as Sidebar from '@cio/ui/base/sidebar';
  import { profile } from '$lib/utils/store/user';
  import { currentOrg, orgs } from '$lib/utils/store/org';

  import AppLogo from './app-logo.svelte';
  import NavMain from './nav-main.svelte';
  import { orgNavCountsApi } from './org-nav-counts.svelte';
  import { SidebarFooterMenu } from '../footer';
  import SourceOffer from '$features/ui/source-offer.svelte';
  import UpgradeTrigger from './upgrade-trigger.svelte';
  import { WhatsNewCard, WhatsNewModal } from '$features/whats-new/components';
  import { HIDE_UPSTREAM_PROMOS } from '$lib/utils/constants/promos';
  import SidebarSkeleton from '../sidebar-skeleton.svelte';
  import AccountLoadNotice from '$features/app/account-load-notice.svelte';
  import { appInitApi } from '$features/app/init.svelte';

  const isOrgLoaded = $derived($orgs.length > 0 && $profile.id);

  $effect(() => {
    if (!isOrgLoaded || !$currentOrg.id) return;
    void orgNavCountsApi.ensureCounts($currentOrg.id);
  });
</script>

{#if !isOrgLoaded}
  {#if appInitApi.error}
    <div class="ui:bg-sidebar hidden h-[calc(100vh-48px)] w-64 flex-col border-r p-4 md:flex">
      <AccountLoadNotice />
    </div>
  {:else}
    <SidebarSkeleton />
  {/if}
{:else}
  <Sidebar.Root collapsible="icon">
    <Sidebar.Header>
      <AppLogo />
    </Sidebar.Header>

    <Sidebar.Content class="gap-0!">
      <NavMain />
    </Sidebar.Content>

    <Sidebar.Footer class="gap-4!">
      {#if !HIDE_UPSTREAM_PROMOS}
        <WhatsNewCard />
      {/if}
      <UpgradeTrigger />
      <SidebarFooterMenu />
      <SourceOffer class="px-2 py-1" />
    </Sidebar.Footer>

    <Sidebar.Rail />
  </Sidebar.Root>

  {#if !HIDE_UPSTREAM_PROMOS}
    <WhatsNewModal />
  {/if}
{/if}
