<script lang="ts">
  import { Button } from '@cio/ui/base/button';
  import * as Dialog from '@cio/ui/base/dialog';
  import * as Field from '@cio/ui/base/field';
  import * as Select from '@cio/ui/base/select';
  import { CheckboxField } from '@cio/ui/custom/checkbox-field';
  import { InputField } from '@cio/ui/custom/input-field';
  import { TextareaField } from '@cio/ui/custom/textarea-field';
  import type { TFellowConsentStatus } from '@cio/utils/validation/organization';

  import { paceApi } from '$features/pace/api/pace.svelte';
  import { changedSafeguardingFields } from '$features/pace/utils/pace-utils';
  import type { SafeguardingView } from '$features/pace/utils/types';
  import { t } from '$lib/utils/functions/translations';

  interface Props {
    open?: boolean;
    memberId?: number;
    fellowName?: string;
  }

  let { open = $bindable(false), memberId = 0, fellowName = '' }: Props = $props();

  const consentStatuses = ['none', 'pending', 'granted', 'revoked'] as const;

  let loadedMemberId = 0;
  let form = $state({
    isMinor: false,
    guardianName: '',
    guardianEmail: '',
    guardianPhone: '',
    consentStatus: 'none' as TFellowConsentStatus,
    consentDate: '',
    notes: ''
  });

  function resetForm() {
    form.isMinor = false;
    form.guardianName = '';
    form.guardianEmail = '';
    form.guardianPhone = '';
    form.consentStatus = 'none';
    form.consentDate = '';
    form.notes = '';
  }

  function fill(record: SafeguardingView['record']) {
    form.isMinor = record.isMinor;
    form.guardianName = record.guardianName ?? '';
    form.guardianEmail = record.guardianEmail ?? '';
    form.guardianPhone = record.guardianPhone ?? '';
    form.consentStatus = record.consentStatus;
    form.consentDate = record.consentAt ? record.consentAt.slice(0, 10) : '';
    form.notes = record.notes ?? '';
  }

  function handleOpenChange(isOpen: boolean) {
    open = isOpen;

    if (!isOpen) {
      loadedMemberId = 0;
      resetForm();
    }
  }

  function fillLoadedRecord() {
    if (!open) return;

    const record = paceApi.safeguarding?.record;
    if (!record) return;

    fill(record);
  }

  function handleStatusChange(value: string) {
    form.consentStatus = value as TFellowConsentStatus;

    if (value === 'none') form.consentDate = '';
  }

  async function save() {
    const consentAt =
      form.consentStatus === 'none' || form.consentDate === '' ? null : `${form.consentDate}T00:00:00.000Z`;
    const saved = await paceApi.saveSafeguarding(memberId, {
      isMinor: form.isMinor,
      guardianName: form.guardianName,
      guardianEmail: form.guardianEmail,
      guardianPhone: form.guardianPhone,
      consentStatus: form.consentStatus,
      consentAt,
      notes: form.notes
    });

    if (saved && paceApi.safeguarding) fill(paceApi.safeguarding.record);
  }

  $effect(() => {
    if (!open || !memberId || memberId === loadedMemberId) return;

    loadedMemberId = memberId;
    void paceApi.loadSafeguarding(memberId).then(fillLoadedRecord);
  });
</script>

<Dialog.Root {open} onOpenChange={handleOpenChange}>
  <Dialog.Content class="max-h-[85vh] overflow-y-auto sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>{$t('pace.safeguarding.title', { name: fellowName })}</Dialog.Title>
      <Dialog.Description>{$t('pace.safeguarding.description')}</Dialog.Description>
    </Dialog.Header>

    <Field.Group>
      <Field.Set>
        <Field.Legend>{$t('pace.safeguarding.guardian_heading')}</Field.Legend>
        <Field.Field orientation="horizontal">
          <CheckboxField label={$t('pace.safeguarding.is_minor')} bind:checked={form.isMinor} />
        </Field.Field>
        <Field.Group>
          <Field.Field>
            <InputField label={$t('pace.safeguarding.guardian_name')} bind:value={form.guardianName} />
          </Field.Field>
          <Field.Field>
            <InputField type="email" label={$t('pace.safeguarding.guardian_email')} bind:value={form.guardianEmail} />
          </Field.Field>
          <Field.Field>
            <InputField label={$t('pace.safeguarding.guardian_phone')} bind:value={form.guardianPhone} />
          </Field.Field>
        </Field.Group>
      </Field.Set>

      <Field.Separator />

      <Field.Set>
        <Field.Legend>{$t('pace.safeguarding.consent_heading')}</Field.Legend>
        <Field.Group>
          <Field.Field>
            <Field.Label>{$t('pace.safeguarding.consent_status')}</Field.Label>
            <Select.Root type="single" value={form.consentStatus} onValueChange={handleStatusChange}>
              <Select.Trigger class="w-full">
                {$t(`pace.consent.${form.consentStatus}`)}
              </Select.Trigger>
              <Select.Content>
                {#each consentStatuses as status (status)}
                  <Select.Item value={status}>{$t(`pace.consent.${status}`)}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </Field.Field>
          <Field.Field>
            <InputField
              type="date"
              label={$t('pace.safeguarding.consent_date')}
              bind:value={form.consentDate}
              isDisabled={form.consentStatus === 'none'}
            />
          </Field.Field>
          <Field.Field>
            <TextareaField label={$t('pace.safeguarding.notes')} bind:value={form.notes} />
          </Field.Field>
        </Field.Group>
      </Field.Set>
    </Field.Group>

    <div class="mt-4">
      <h3 class="text-sm font-medium">{$t('pace.safeguarding.audit_heading')}</h3>
      {#if paceApi.safeguarding && paceApi.safeguarding.audit.length > 0}
        <ul class="mt-2 space-y-2 text-sm">
          {#each paceApi.safeguarding.audit as entry (entry.id)}
            <li class="ui:border-border rounded border px-3 py-2">
              <p>{entry.actorEmail ?? $t('pace.safeguarding.audit_unknown')}</p>
              <p class="ui:text-muted-foreground">{entry.createdAt}</p>
              <p class="ui:text-muted-foreground">
                {changedSafeguardingFields(entry.before, entry.after)
                  .map((field) => $t(`pace.safeguarding.field.${field}`))
                  .join(', ') || $t('pace.safeguarding.audit_unchanged')}
              </p>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="ui:text-muted-foreground mt-2 text-sm">{$t('pace.safeguarding.audit_empty')}</p>
      {/if}
    </div>

    <Dialog.Footer>
      <Button size="sm" variant="outline" onclick={() => handleOpenChange(false)}>
        {$t('common.cancel')}
      </Button>
      <Button size="sm" testId="safeguarding-save" loading={paceApi.isLoading} onclick={save}>
        {$t('common.save_changes')}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
