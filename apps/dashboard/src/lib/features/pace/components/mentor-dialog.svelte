<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';

  import { Button } from '@cio/ui/base/button';
  import * as Dialog from '@cio/ui/base/dialog';
  import * as Select from '@cio/ui/base/select';
  import { CheckboxField } from '@cio/ui/custom/checkbox-field';
  import { InputField } from '@cio/ui/custom/input-field';

  import { paceApi } from '$features/pace/api/pace.svelte';
  import { t } from '$lib/utils/functions/translations';

  interface Props {
    open?: boolean;
    onSaved?: () => void;
  }

  let { open = $bindable(false), onSaved }: Props = $props();

  let mentorId = $state('');
  let search = $state('');
  let loaded = false;
  const selectedIds = new SvelteSet<string>();

  function applyMentor(profileId: string) {
    mentorId = profileId;
    const mentor = paceApi.roster?.mentors.find((row) => row.mentorProfileId === profileId);
    selectedIds.clear();

    for (const fellow of mentor?.fellows ?? []) selectedIds.add(fellow.profileId);
  }

  function toggleFellow(profileId: string) {
    if (selectedIds.has(profileId)) {
      selectedIds.delete(profileId);
      return;
    }

    selectedIds.add(profileId);
  }

  function reset() {
    mentorId = '';
    search = '';
    loaded = false;
    selectedIds.clear();
  }

  function handleOpenChange(isOpen: boolean) {
    open = isOpen;

    if (!isOpen) reset();
  }

  function selectFirstMentor() {
    if (!open) return;

    const firstMentor = paceApi.roster?.mentors[0];
    if (!firstMentor) return;

    applyMentor(firstMentor.mentorProfileId);
  }

  async function save() {
    if (!mentorId) return;

    const saved = await paceApi.saveMentors(mentorId, { fellowProfileIds: [...selectedIds] });

    if (!saved) return;

    open = false;
    reset();
    onSaved?.();
  }

  $effect(() => {
    if (!open || loaded) return;

    loaded = true;
    void paceApi.loadMentors().then(selectFirstMentor);
  });

  const visibleFellows = $derived(
    (paceApi.roster?.fellows ?? []).filter((fellow) => {
      const query = search.trim().toLowerCase();

      if (!query) return true;

      return fellow.name.toLowerCase().includes(query) || (fellow.email ?? '').toLowerCase().includes(query);
    })
  );
</script>

<Dialog.Root {open} onOpenChange={handleOpenChange}>
  <Dialog.Content class="max-h-[85vh] overflow-y-auto sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>{$t('pace.mentors.title')}</Dialog.Title>
      <Dialog.Description>{$t('pace.mentors.description')}</Dialog.Description>
    </Dialog.Header>

    {#if !paceApi.roster}
      <p class="ui:text-muted-foreground text-sm">{$t('pace.loading')}</p>
    {:else if paceApi.roster.mentors.length === 0}
      <p class="text-sm">{$t('pace.mentors.empty')}</p>
    {:else}
      <div class="space-y-4">
        <Select.Root
          type="single"
          value={mentorId}
          onValueChange={(value) => {
            if (value) applyMentor(value);
          }}
        >
          <Select.Trigger class="w-full" data-testid="pace-mentor-select">
            {paceApi.roster.mentors.find((mentor) => mentor.mentorProfileId === mentorId)?.mentorName ??
              $t('pace.mentors.pick')}
          </Select.Trigger>
          <Select.Content>
            {#each paceApi.roster.mentors as mentor (mentor.mentorProfileId)}
              <Select.Item value={mentor.mentorProfileId}>{mentor.mentorName}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>

        <InputField label={$t('pace.mentors.search')} bind:value={search} />

        <div class="max-h-64 space-y-2 overflow-y-auto">
          {#each visibleFellows as fellow (fellow.profileId)}
            <CheckboxField
              checked={selectedIds.has(fellow.profileId)}
              label={fellow.name}
              onclick={() => toggleFellow(fellow.profileId)}
            />
          {/each}
        </div>
      </div>
    {/if}

    <Dialog.Footer>
      <Button size="sm" variant="outline" onclick={() => handleOpenChange(false)}>
        {$t('common.cancel')}
      </Button>
      <Button size="sm" testId="mentor-assignment-save" disabled={!mentorId} loading={paceApi.isLoading} onclick={save}>
        {$t('pace.mentors.save')}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
