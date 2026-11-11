<script lang="ts">
  import { sourceOfferUrl } from '$lib/utils/functions/brand';
  import { t } from '$lib/utils/functions/translations';
</script>

<p class="ui:text-muted-foreground px-4 py-3 text-center text-xs">
  <a class="underline" href={sourceOfferUrl()} rel="noopener noreferrer" target="_blank">
    {$t('common.source_offer')}
  </a>
</p>
