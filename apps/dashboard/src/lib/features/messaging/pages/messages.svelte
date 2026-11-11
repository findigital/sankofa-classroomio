<script lang="ts">
  import { browser } from '$app/environment';

  import { Button } from '@cio/ui/base/button';
  import { CheckboxField } from '@cio/ui/custom/checkbox-field';
  import * as Page from '@cio/ui/base/page';
  import * as Select from '@cio/ui/base/select';
  import { Switch } from '@cio/ui/base/switch';
  import { InputField } from '@cio/ui/custom/input-field';
  import { Skeleton } from '@cio/ui/base/skeleton';
  import { ROLE } from '@cio/utils/constants';

  import { messagingApi } from '$features/messaging/api/messaging.svelte';
  import { messagingPresence } from '$features/messaging/api/messaging-presence.svelte';
  import type { InboxViewProps } from '$features/messaging/utils/inbox-types';
  import type { MessagingChannel } from '$features/messaging/utils/types';
  import { MESSAGING_ENABLED } from '$lib/utils/constants/messaging';
  import { t } from '$lib/utils/functions/translations';
  import { currentOrg } from '$lib/utils/store/org';

  let loadedOrgId = '';
  let keywordPhrase = $state('');
  let keywordAction = $state<'flag' | 'block'>('flag');
  let selected = $state<MessagingChannel | null>(null);
  let focusChannel = $state<MessagingChannel | null>(null);
  let staffLimited = $state(false);
  let staffChecks = $state<Record<string, boolean>>({});
  let inboxHost = $state<HTMLDivElement | null>(null);
  let paintInbox = $state<((props: InboxViewProps) => void) | null>(null);

  function channelKey(channel: MessagingChannel) {
    return `${channel.channelType}:${channel.channelId}`;
  }

  function sentMessageId(sent: unknown) {
    if (!sent || typeof sent !== 'object' || !('data' in sent)) return null;

    const data = sent.data;

    if (!data || typeof data !== 'object' || !('id' in data) || typeof data.id !== 'string') return null;

    return data.id;
  }

  function applySafeguarding() {
    const setting = messagingApi.safeguarding;

    if (!setting) return;

    staffLimited = setting.configured;

    for (const profileId of Object.keys(staffChecks)) {
      delete staffChecks[profileId];
    }

    for (const admin of setting.admins) {
      staffChecks[admin.profileId] = setting.configured && setting.staffIds.includes(admin.profileId);
    }
  }

  async function connectStream() {
    const session = messagingApi.session;
    const organizationId = $currentOrg.id;

    if (!browser || !session || !organizationId) return;

    if (messagingApi.channels === null) await messagingApi.loadChannels();

    const channelIds = (messagingApi.channels ?? []).map((channel) => channelKey(channel));

    await messagingPresence.connect(session, organizationId, channelIds);
  }

  async function saveStaff() {
    const staffIds = staffLimited
      ? (messagingApi.safeguarding?.admins ?? [])
          .filter((admin) => staffChecks[admin.profileId])
          .map((admin) => admin.profileId)
      : null;
    const saved = await messagingApi.saveSafeguarding(staffIds);

    if (saved) {
      applySafeguarding();
      await messagingApi.loadChannels();
    }
  }

  async function selectAdminChannel(channel: MessagingChannel) {
    selected = channel;
    messagingApi.messages = null;
    await messagingApi.loadAdminThread(channel.channelType, channel.channelId);
  }

  async function openPerson(profileId: string) {
    const opened = await messagingApi.openDirect(profileId);

    if (opened) focusChannel = opened;
  }

  async function exportChannel(channelType: string, channelId: string, format: 'json' | 'csv') {
    const file = await messagingApi.exportChannel(channelType, channelId, format);

    if (file) messagingApi.downloadExport(file.data);
  }

  async function exportSelected(format: 'json' | 'csv') {
    if (!selected) return;

    await exportChannel(selected.channelType, selected.channelId, format);
  }

  $effect(() => {
    const organizationId = $currentOrg.id;

    if (!MESSAGING_ENABLED || !organizationId || organizationId === loadedOrgId) return;

    loadedOrgId = organizationId;
    selected = null;
    focusChannel = null;
    messagingApi.channels = null;
    messagingApi.messages = null;
    void messagingApi.loadSession().then(() => connectStream().catch(() => undefined));
    void messagingApi.loadChannels();
    void messagingApi.loadDirectory();

    if ($currentOrg.roleId === ROLE.ADMIN) {
      void messagingApi.loadAdminChannels();
      void messagingApi.loadKeywords();
      void messagingApi.loadCohorts();
      void messagingApi.loadActivity();
      void messagingApi.loadSafeguarding().then(() => applySafeguarding());
    }
  });

  $effect(() => {
    const host = inboxHost;

    if (!browser || !host) return;

    let cancelled = false;
    let destroy = () => undefined;

    void import('$features/messaging/components/inbox-view').then((module) => {
      if (cancelled) return;

      const mounted = module.mountInbox(host);
      destroy = mounted.destroy;
      paintInbox = mounted.render;
    });

    return () => {
      cancelled = true;
      destroy();
      paintInbox = null;
    };
  });

  $effect(() => {
    const render = paintInbox;
    const session = messagingApi.session;
    const channels = messagingApi.channels;

    if (!render || !session || !channels) return;

    const organizationId = $currentOrg.id;
    const roleId = $currentOrg.roleId;
    const directory = messagingApi.directory ?? [];
    const focused = focusChannel;

    render({
      apiKey: session.apiKey,
      token: session.token,
      userId: session.userId,
      userName: session.userName,
      organizationId,
      channels: channels.map((channel) => ({
        channelType: channel.channelType,
        channelId: channel.channelId,
        name: channel.name ?? '',
        purpose: channel.purpose,
        cohortId: channel.cohortId,
        image: channel.image ?? null
      })),
      directory: directory.map((person) => ({
        profileId: person.profileId,
        name: person.name
      })),
      disclosureAccepted: session.disclosureAccepted,
      canPostAnnouncements: roleId === ROLE.ADMIN || roleId === ROLE.TUTOR,
      roleIsAdmin: roleId === ROLE.ADMIN,
      focusKey: focused ? channelKey(focused) : null,
      labels: {
        flag: $t('messaging.flag'),
        mute: $t('messaging.mute'),
        back: $t('common.back'),
        directory: $t('messaging.directory'),
        open: $t('messaging.open'),
        export: $t('messaging.export'),
        exportCsv: $t('messaging.export_csv'),
        empty: $t('messaging.empty'),
        select: $t('messaging.select')
      },
      onSend: async (channelType, channelId, text, message) => {
        const sent = await messagingApi.send(channelType, channelId, text, {
          quiet: true,
          id: message.id,
          parentId: message.parentId
        });

        return sentMessageId(sent);
      },
      onFlag: (channelType, channelId, messageId) => {
        void messagingApi.flag(channelType, channelId, messageId);
      },
      onMute: (userId) => {
        void messagingApi.mute(userId);
      },
      onOpenDirect: (profileId) => {
        void openPerson(profileId);
      },
      onExport: (channelType, channelId, format) => {
        void exportChannel(channelType, channelId, format);
      }
    });
  });
</script>

<div class="messaging-page flex h-[calc(100dvh-4rem)] min-h-0 w-full flex-col overflow-hidden">
  <Page.Root class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <Page.Header>
      <Page.HeaderContent>
        <Page.Title>{$t('messaging.heading')}</Page.Title>
        <Page.Subtitle>{$t('messaging.subtitle')}</Page.Subtitle>
      </Page.HeaderContent>
    </Page.Header>

    <Page.Body class="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      {#snippet child()}
        {#if !MESSAGING_ENABLED}
          <p>{$t('messaging.disabled')}</p>
        {:else}
          <div
            class="flex flex-col gap-2 rounded-md border p-3 max-md:flex-row max-md:items-center max-md:gap-3 max-md:px-3 max-md:py-1"
            data-testid="messaging-staff-notice"
          >
            <p class="max-md:min-w-0 max-md:flex-1 max-md:truncate max-md:text-sm">{$t('messaging.notice.body')}</p>
            {#if messagingApi.session && !messagingApi.session.disclosureAccepted}
              <Button
                class="mt-2 max-md:mt-0 max-md:shrink-0"
                size="sm"
                testId="messaging-disclosure-accept"
                onclick={() => messagingApi.acceptDisclosure()}
              >
                {$t('messaging.notice.accept')}
              </Button>
            {/if}
          </div>

          {#if !messagingApi.session || !messagingApi.channels}
            <div class="min-h-0 flex-1" data-testid="messaging-inbox-loading">
              {#each [0, 1, 2] as index (index)}
                <Skeleton class="mb-2 h-10 w-full" />
              {/each}
            </div>
          {:else}
            <div class="flex min-h-0 flex-1 flex-col" bind:this={inboxHost} data-testid="messaging-inbox"></div>
          {/if}

          {#if $currentOrg.roleId === ROLE.ADMIN}
            <div class="max-h-64 shrink-0 space-y-4 overflow-y-auto border-t pt-4">
              <section>
                <h2 class="mb-2 text-sm font-semibold">{$t('messaging.all_channels')}</h2>
                {#if messagingApi.adminChannels}
                  <ul class="space-y-1">
                    {#each messagingApi.adminChannels as channel (channelKey(channel))}
                      <li>
                        <button type="button" class="text-sm underline" onclick={() => selectAdminChannel(channel)}>
                          {channel.name || channel.purpose}
                        </button>
                      </li>
                    {/each}
                  </ul>
                  {#if selected}
                    <div class="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        testId="messaging-export"
                        onclick={() => exportSelected('json')}
                      >
                        {$t('messaging.export')}
                      </Button>
                      <Button size="sm" variant="outline" onclick={() => exportSelected('csv')}>
                        {$t('messaging.export_csv')}
                      </Button>
                    </div>
                    <ul class="mt-2 space-y-1 text-sm">
                      {#each messagingApi.messages ?? [] as message (message.id)}
                        <li>
                          {message.userName}: {message.text}
                        </li>
                      {/each}
                    </ul>
                  {/if}
                {/if}
              </section>

              <section>
                <h2 class="mb-2 text-sm font-semibold">{$t('messaging.keywords')}</h2>
                <form
                  class="mb-2 flex flex-wrap items-end gap-2"
                  onsubmit={(event) => {
                    event.preventDefault();
                    const phrase = keywordPhrase;
                    keywordPhrase = '';
                    void messagingApi.addKeyword({ phrase, action: keywordAction }).then((saved) => {
                      if (!saved) keywordPhrase = phrase;
                    });
                  }}
                >
                  <InputField
                    testId="messaging-keyword-phrase"
                    label={$t('messaging.keyword_phrase')}
                    bind:value={keywordPhrase}
                  />
                  <Select.Root
                    type="single"
                    value={keywordAction}
                    onValueChange={(value) => {
                      if (value === 'flag' || value === 'block') keywordAction = value;
                    }}
                  >
                    <Select.Trigger class="w-36">
                      {keywordAction === 'block' ? $t('messaging.keyword_block') : $t('messaging.keyword_flag')}
                    </Select.Trigger>
                    <Select.Content>
                      <Select.Item value="flag">{$t('messaging.keyword_flag')}</Select.Item>
                      <Select.Item value="block">{$t('messaging.keyword_block')}</Select.Item>
                    </Select.Content>
                  </Select.Root>
                  <Button type="submit" size="sm">{$t('messaging.keyword_add')}</Button>
                </form>
                <ul class="space-y-1 text-sm">
                  {#each messagingApi.keywords ?? [] as keyword (keyword.id)}
                    <li class="flex items-center justify-between gap-2">
                      <span>
                        {keyword.phrase}
                        ({keyword.action === 'block' ? $t('messaging.keyword_block') : $t('messaging.keyword_flag')})
                      </span>
                      <Button size="sm" variant="outline" onclick={() => messagingApi.removeKeyword(keyword.id)}>
                        {$t('messaging.keyword_remove')}
                      </Button>
                    </li>
                  {/each}
                </ul>
              </section>

              <section>
                <h2 class="mb-2 text-sm font-semibold">{$t('messaging.cohorts')}</h2>
                <ul class="space-y-2">
                  {#each messagingApi.cohorts ?? [] as cohort (cohort.groupId)}
                    <li class="flex items-center gap-2 text-sm">
                      <Switch
                        checked={cohort.fellowDmEnabled}
                        data-testid="messaging-fellow-dm-{cohort.groupId}"
                        onCheckedChange={(checked) => messagingApi.setFellowDm(cohort.groupId, checked)}
                      />
                      <span>{cohort.name}</span>
                      <span class="ui:text-muted-foreground">{$t('messaging.fellow_dm')}</span>
                    </li>
                  {/each}
                </ul>
              </section>

              <section>
                <h2 class="mb-2 text-sm font-semibold">{$t('messaging.safeguarding.heading')}</h2>
                <p class="mb-2 text-sm">{$t('messaging.safeguarding.description')}</p>
                <div class="mb-2 flex items-center gap-2 text-sm">
                  <Switch
                    checked={staffLimited}
                    data-testid="messaging-safeguarding-limit"
                    onCheckedChange={(checked) => {
                      staffLimited = checked;
                    }}
                  />
                  <span>{$t('messaging.safeguarding.limit')}</span>
                </div>
                {#if staffLimited}
                  {#if (messagingApi.safeguarding?.admins.length ?? 0) === 0}
                    <p class="text-sm">{$t('messaging.safeguarding.empty')}</p>
                  {:else}
                    <ul class="space-y-1">
                      {#each messagingApi.safeguarding?.admins ?? [] as admin (admin.profileId)}
                        <li>
                          <CheckboxField
                            label={admin.name}
                            bind:checked={staffChecks[admin.profileId]}
                            testId="messaging-safeguarding-{admin.profileId}"
                          />
                        </li>
                      {/each}
                    </ul>
                  {/if}
                {/if}
                <Button
                  class="mt-2"
                  size="sm"
                  testId="messaging-safeguarding-save"
                  disabled={!messagingApi.safeguarding}
                  onclick={() => saveStaff()}
                >
                  {$t('messaging.safeguarding.save')}
                </Button>
              </section>

              <section>
                <h2 class="mb-2 text-sm font-semibold">{$t('messaging.activity')}</h2>
                {#if !messagingApi.activity || messagingApi.activity.audits.length === 0}
                  <p class="text-sm">{$t('messaging.activity_empty')}</p>
                {:else}
                  <ul class="space-y-1 text-sm">
                    {#each messagingApi.activity.audits as audit (audit.id)}
                      <li>{audit.action} {audit.channelType ?? ''} {audit.channelId ?? ''}</li>
                    {/each}
                  </ul>
                {/if}
              </section>
            </div>
          {/if}
        {/if}
      {/snippet}
    </Page.Body>
  </Page.Root>
</div>

<style>
  @media (max-width: 767px) {
    .messaging-page :global([data-slot='page-header']) {
      display: none;
    }

    .messaging-page :global([data-slot='page-body']) {
      gap: 0.5rem;
      padding-bottom: 0;
    }

    .messaging-page :global([data-testid='messaging-inbox']) {
      width: 100%;
      min-width: 0;
    }
  }
</style>
