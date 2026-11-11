<script lang="ts">
  import { browser } from '$app/environment';
  import { onDestroy } from 'svelte';
  import type { Event } from 'stream-chat';

  import { Button } from '@cio/ui/base/button';
  import { CheckboxField } from '@cio/ui/custom/checkbox-field';
  import * as Page from '@cio/ui/base/page';
  import * as Select from '@cio/ui/base/select';
  import { Switch } from '@cio/ui/base/switch';
  import { InputField } from '@cio/ui/custom/input-field';
  import { TextareaField } from '@cio/ui/custom/textarea-field';
  import { Skeleton } from '@cio/ui/base/skeleton';
  import { ROLE } from '@cio/utils/constants';

  import { messagingApi } from '$features/messaging/api/messaging.svelte';
  import { messagingPresence } from '$features/messaging/api/messaging-presence.svelte';
  import type { MessagingChannel, MessagingThreadMessage } from '$features/messaging/utils/types';
  import { MESSAGING_ENABLED } from '$lib/utils/constants/messaging';
  import { t } from '$lib/utils/functions/translations';
  import { currentOrg } from '$lib/utils/store/org';

  let loadedOrgId = '';
  let draft = $state('');
  let keywordPhrase = $state('');
  let keywordAction = $state<'flag' | 'block'>('flag');
  let selected = $state<MessagingChannel | null>(null);
  let staffLimited = $state(false);
  let staffChecks = $state<Record<string, boolean>>({});
  let stopLiveMessages: (() => void) | null = null;

  function channelKey(channel: MessagingChannel) {
    return `${channel.channelType}:${channel.channelId}`;
  }

  function appendLiveMessage(message: MessagingThreadMessage) {
    const existing = messagingApi.messages ?? [];

    if (existing.some((item) => item.id === message.id)) return;

    messagingApi.messages = [...existing, message];
  }

  function appendFromEvent(event: Event) {
    const message = event.message;

    if (!message?.id || !selected) return;
    if (event.channel_type !== selected.channelType || event.channel_id !== selected.channelId) return;

    const createdAt = message.created_at ? new Date(message.created_at).toISOString() : '';

    appendLiveMessage({
      id: message.id,
      text: message.text ?? '',
      userId: message.user?.id ?? '',
      userName: message.user?.name ?? '',
      createdAt
    });
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

    await messagingPresence.connect(session, organizationId);
    stopLiveMessages?.();
    stopLiveMessages = messagingPresence.onMessage(appendFromEvent);
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

  async function selectChannel(channel: MessagingChannel, asAdmin: boolean) {
    selected = channel;
    messagingApi.messages = null;

    if (asAdmin) {
      await messagingApi.loadAdminThread(channel.channelType, channel.channelId);
      return;
    }

    await messagingApi.loadThread(channel.channelType, channel.channelId);
  }

  async function sendMessage() {
    if (!selected || !messagingApi.session?.disclosureAccepted) return;

    const text = draft;
    draft = '';
    const sent = await messagingApi.send(selected.channelType, selected.channelId, text);

    if (!sent) draft = text;
  }

  async function exportSelected(format: 'json' | 'csv') {
    if (!selected) return;

    const file = await messagingApi.exportChannel(selected.channelType, selected.channelId, format);

    if (file) messagingApi.downloadExport(file.data);
  }

  $effect(() => {
    const organizationId = $currentOrg.id;

    if (!MESSAGING_ENABLED || !organizationId || organizationId === loadedOrgId) return;

    loadedOrgId = organizationId;
    selected = null;
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

  onDestroy(() => {
    stopLiveMessages?.();
  });
</script>

<div class="flex h-[calc(100dvh-4rem)] min-h-0 flex-col overflow-hidden">
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
          <div class="rounded-md border p-3" data-testid="messaging-staff-notice">
            <p>{$t('messaging.notice.body')}</p>
            {#if messagingApi.session && !messagingApi.session.disclosureAccepted}
              <Button
                class="mt-2"
                size="sm"
                testId="messaging-disclosure-accept"
                onclick={() => messagingApi.acceptDisclosure()}
              >
                {$t('messaging.notice.accept')}
              </Button>
            {/if}
          </div>

          <div class="grid min-h-0 flex-1 gap-4 md:grid-cols-[16rem_1fr]">
            <aside class="min-h-0 overflow-y-auto" data-testid="messaging-channel-list">
              <h2 class="mb-2 text-sm font-semibold">{$t('messaging.channels')}</h2>
              {#if !messagingApi.channels}
                {#each [0, 1, 2] as index (index)}
                  <Skeleton class="mb-2 h-10 w-full" />
                {/each}
              {:else if messagingApi.channels.length === 0}
                <p class="text-sm">{$t('messaging.empty')}</p>
              {:else}
                <ul class="space-y-1">
                  {#each messagingApi.channels as channel (channelKey(channel))}
                    <li>
                      <button
                        type="button"
                        class="ui:hover:bg-muted w-full rounded-md px-2 py-1 text-left text-sm"
                        onclick={() => selectChannel(channel, false)}
                      >
                        {channel.name || channel.purpose}
                      </button>
                    </li>
                  {/each}
                </ul>
              {/if}

              {#if messagingApi.directory && messagingApi.directory.length > 0}
                <h2 class="mt-4 mb-2 text-sm font-semibold">{$t('messaging.directory')}</h2>
                <ul class="space-y-1">
                  {#each messagingApi.directory as person (person.profileId)}
                    <li class="flex items-center justify-between gap-2 text-sm">
                      <span>{person.name}</span>
                      <Button
                        size="sm"
                        variant="secondary"
                        onclick={async () => {
                          const opened = await messagingApi.openDirect(person.profileId);

                          if (opened) await selectChannel(opened, false);
                        }}
                      >
                        {$t('messaging.open')}
                      </Button>
                    </li>
                  {/each}
                </ul>
              {/if}
            </aside>

            <section class="flex min-h-0 flex-col overflow-hidden">
              {#if !selected}
                <p class="text-sm">{$t('messaging.select')}</p>
              {:else}
                <div class="mb-2 flex items-center justify-between gap-2">
                  <h2 class="text-sm font-semibold">{selected.name || selected.purpose}</h2>
                  {#if $currentOrg.roleId === ROLE.ADMIN}
                    <div class="flex gap-2">
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
                  {/if}
                </div>
                <div class="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                  {#if !messagingApi.messages}
                    <Skeleton class="h-16 w-full" />
                  {:else}
                    {#each messagingApi.messages as message (message.id)}
                      <article class="rounded-md border p-2 text-sm">
                        <p class="font-medium">{message.userName}</p>
                        <p class="whitespace-pre-wrap">{message.text}</p>
                        <div class="mt-2 flex gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onclick={() =>
                              selected && messagingApi.flag(selected.channelType, selected.channelId, message.id)}
                          >
                            {$t('messaging.flag')}
                          </Button>
                          {#if message.userId && message.userId !== messagingApi.session?.userId}
                            <Button size="sm" variant="secondary" onclick={() => messagingApi.mute(message.userId)}>
                              {$t('messaging.mute')}
                            </Button>
                          {/if}
                        </div>
                      </article>
                    {/each}
                  {/if}
                </div>
                {#if selected.purpose !== 'announcement' || $currentOrg.roleId === ROLE.ADMIN || $currentOrg.roleId === ROLE.TUTOR}
                  <form
                    class="mt-3"
                    onsubmit={(event) => {
                      event.preventDefault();
                      void sendMessage();
                    }}
                  >
                    <TextareaField label={$t('messaging.compose')} bind:value={draft} />
                    <Button
                      class="mt-2"
                      type="submit"
                      testId="messaging-send"
                      disabled={!messagingApi.session?.disclosureAccepted}
                    >
                      {$t('messaging.send')}
                    </Button>
                  </form>
                {/if}
              {/if}
            </section>
          </div>

          {#if $currentOrg.roleId === ROLE.ADMIN}
            <div class="max-h-64 shrink-0 space-y-4 overflow-y-auto border-t pt-4">
              <section>
                <h2 class="mb-2 text-sm font-semibold">{$t('messaging.all_channels')}</h2>
                {#if messagingApi.adminChannels}
                  <ul class="space-y-1">
                    {#each messagingApi.adminChannels as channel (channelKey(channel))}
                      <li>
                        <button type="button" class="text-sm underline" onclick={() => selectChannel(channel, true)}>
                          {channel.name || channel.purpose}
                        </button>
                      </li>
                    {/each}
                  </ul>
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
