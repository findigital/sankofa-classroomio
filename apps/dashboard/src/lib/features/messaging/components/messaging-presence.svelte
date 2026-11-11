<script lang="ts">
  import { messagingApi } from '$features/messaging/api/messaging.svelte';
  import { messagingPresence } from '$features/messaging/api/messaging-presence.svelte';
  import { MESSAGING_ENABLED } from '$lib/utils/constants/messaging';
  import { currentOrg } from '$lib/utils/store/org';

  let connectedOrgId = '';

  $effect(() => {
    const organizationId = $currentOrg.id;

    if (!MESSAGING_ENABLED || !organizationId || organizationId === connectedOrgId) return;

    let cancelled = false;

    void (async () => {
      await messagingApi.loadSession({ notify: false });

      if (cancelled) return;

      const session = messagingApi.session;

      if (!session) return;

      if (messagingApi.channels === null) {
        await messagingApi.loadChannels({ notify: false });
      }

      if (cancelled) return;

      const channelIds = (messagingApi.channels ?? []).map((channel) => `${channel.channelType}:${channel.channelId}`);

      await messagingPresence.connect(session, organizationId, channelIds);

      if (!cancelled) connectedOrgId = organizationId;
    })().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  });
</script>
