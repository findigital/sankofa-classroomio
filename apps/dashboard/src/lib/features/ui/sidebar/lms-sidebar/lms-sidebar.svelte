<script lang="ts">
  import * as Sidebar from '@cio/ui/base/sidebar';
  import { profile } from '$lib/utils/store/user';
  import { orgs } from '$lib/utils/store/org';

  import NavMain from './nav-main.svelte';
  import OrgLogo from '../org-sidebar/org-logo.svelte';
  import { SidebarFooterMenu } from '../footer';
  import SourceOffer from '$features/ui/source-offer.svelte';
  import SidebarSkeleton from '../sidebar-skeleton.svelte';
  import AccountLoadNotice from '$features/app/account-load-notice.svelte';
  import { appInitApi } from '$features/app/init.svelte';

  const isOrgLoaded = $derived($orgs.length > 0 && $profile.id);
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
      <OrgLogo />
    </Sidebar.Header>

    <Sidebar.Content>
      <NavMain />
    </Sidebar.Content>

    <Sidebar.Footer class="gap-4!">
      <SidebarFooterMenu />
      <SourceOffer class="px-2 py-1" />
    </Sidebar.Footer>

    <Sidebar.Rail />
  </Sidebar.Root>
{/if}
