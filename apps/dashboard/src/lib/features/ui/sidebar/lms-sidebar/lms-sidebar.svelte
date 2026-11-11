<script lang="ts">
  import * as Sidebar from '@cio/ui/base/sidebar';
  import { profile } from '$lib/utils/store/user';
  import { orgs } from '$lib/utils/store/org';

  import NavMain from './nav-main.svelte';
  import OrgLogo from '../org-sidebar/org-logo.svelte';
  import { SidebarFooterMenu } from '../footer';
  import SourceOffer from '$features/ui/source-offer.svelte';
  import SidebarSkeleton from '../sidebar-skeleton.svelte';

  const isOrgLoaded = $derived($orgs.length > 0 && $profile.id);
</script>

{#if !isOrgLoaded}
  <SidebarSkeleton />
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
