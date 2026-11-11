<script lang="ts">
  import * as Avatar from '@cio/ui/base/avatar';
  import * as Sidebar from '@cio/ui/base/sidebar';
  import { Badge } from '@cio/ui/base/badge';
  import { PLAN, PLAN_NAMES } from '@cio/utils/plans';
  import { appBrandName } from '$lib/utils/functions/brand';
  import { shortenName } from '$lib/utils/functions/string';
  import { currentOrg, currentOrgPath, currentOrgPlan } from '$lib/utils/store/org';

  const plan = $derived($currentOrgPlan?.planName || PLAN.BASIC);
  const brandName = $derived($currentOrg.name || appBrandName());
  const homeHref = $derived($currentOrgPath === '#' ? '/' : $currentOrgPath);
</script>

<Sidebar.Menu>
  <Sidebar.MenuItem>
    <Sidebar.MenuButton
      size="sm"
      class="ui:data-[state=open]:bg-sidebar-accent ui:data-[state=open]:text-sidebar-accent-foreground"
    >
      {#snippet child({ props })}
        <a href={homeHref} {...props}>
          <Avatar.Root class="flex size-6 items-center justify-center rounded-md">
            <Avatar.Image src={$currentOrg.avatarUrl} alt={brandName} />
            <Avatar.Fallback class="rounded-md text-xs">{shortenName(brandName)}</Avatar.Fallback>
          </Avatar.Root>

          <span class="truncate font-normal">{brandName}</span>
          <Badge variant="outline" class="capitalize">
            {PLAN_NAMES[plan] || plan}
          </Badge>
        </a>
      {/snippet}
    </Sidebar.MenuButton>
  </Sidebar.MenuItem>
</Sidebar.Menu>
