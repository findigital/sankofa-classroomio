<script lang="ts">
  import { currentOrg, hasBasicAuthSettingsAccess, isEnterprisePlan } from '$lib/utils/store/org';
  import { t } from '$lib/utils/functions/translations';
  import { snackbar } from '$features/ui/snackbar/store';
  import * as Field from '@cio/ui/base/field';
  import { Switch } from '@cio/ui/base/switch';
  import { Textarea } from '@cio/ui/base/textarea';
  import LockIcon from '@lucide/svelte/icons/lock';
  import { orgApi } from '$features/org/api/org.svelte';
  import { tagApi } from '$features/tag/api';
  import * as Alert from '@cio/ui/base/alert';
  import { Checkbox } from '@cio/ui/base/checkbox';
  import { UpgradeLock } from '$features/ui';
  import { SvelteSet } from 'svelte/reactivity';
  import { isAutoEnrollMembersEnabled } from '@cio/utils/functions';

  function readCatalogSettings(settings: unknown) {
    const record = settings && typeof settings === 'object' ? (settings as Record<string, unknown>) : {};
    const groupIds = record.catalogFilterTagGroupIds;

    return {
      hideCoursePricing: record.hideCoursePricing !== false,
      showCourseTypeFilter: record.showCourseTypeFilter !== false,
      catalogFilterTagGroupIds: Array.isArray(groupIds)
        ? groupIds.filter((id): id is string => typeof id === 'string')
        : null
    };
  }

  interface Props {
    hasUnsavedChanges?: boolean;
  }

  let { hasUnsavedChanges = $bindable(false) }: Props = $props();

  // Auth settings state - synced with store
  let disableSignup = $state($currentOrg?.disableSignup ?? false);
  let disableSignupMessage = $state($currentOrg?.disableSignupMessage ?? '');
  let allowPublicSignups = $state(!$currentOrg?.settings?.signup?.inviteOnly);
  let disableEmailPassword = $state($currentOrg?.disableEmailPassword ?? false);
  let disableGoogleAuth = $state($currentOrg?.disableGoogleAuth ?? false);
  let internalEnrollmentOnly = $state($currentOrg?.settings?.internalEnrollmentOnly ?? false);
  let membersOnlyCatalog = $state($currentOrg?.settings?.membersOnlyCatalog ?? false);
  let autoEnrollMembers = $state(isAutoEnrollMembersEnabled($currentOrg?.settings));
  let hideCoursePricing = $state(readCatalogSettings($currentOrg?.settings).hideCoursePricing);
  let showCourseTypeFilter = $state(readCatalogSettings($currentOrg?.settings).showCourseTypeFilter);
  let selectedFilterGroupIds = new SvelteSet<string>();
  let appliedGroupSignature = '';
  let isSaving = $state(false);
  let listedOrgId = '';

  // Sync with store when it changes
  $effect(() => {
    if ($currentOrg) {
      disableSignup = $currentOrg.disableSignup ?? false;
      disableSignupMessage = $currentOrg.disableSignupMessage ?? '';
      allowPublicSignups = !$currentOrg.settings?.signup?.inviteOnly;
      disableEmailPassword = $currentOrg.disableEmailPassword ?? false;
      disableGoogleAuth = $currentOrg.disableGoogleAuth ?? false;
      internalEnrollmentOnly = $currentOrg.settings?.internalEnrollmentOnly ?? false;
      membersOnlyCatalog = $currentOrg.settings?.membersOnlyCatalog ?? false;
      autoEnrollMembers = isAutoEnrollMembersEnabled($currentOrg.settings);
      const catalog = readCatalogSettings($currentOrg.settings);
      hideCoursePricing = catalog.hideCoursePricing;
      showCourseTypeFilter = catalog.showCourseTypeFilter;
    }
  });

  $effect(() => {
    const organizationId = $currentOrg?.id;
    if (!organizationId || organizationId === listedOrgId) return;

    listedOrgId = organizationId;
    void tagApi.getTagGroups();
  });

  $effect(() => {
    const catalog = readCatalogSettings($currentOrg?.settings);
    const groups = tagApi.tagGroups;
    const ids = catalog.catalogFilterTagGroupIds ?? groups.map((group) => group.id);
    const signature = `${$currentOrg?.id ?? ''}:${[...ids].sort().join(',')}`;
    if (signature === appliedGroupSignature) return;

    appliedGroupSignature = signature;
    selectedFilterGroupIds.clear();
    for (const id of ids) selectedFilterGroupIds.add(id);
  });

  let currentAllowPublicSignups = $derived(!$currentOrg?.settings?.signup?.inviteOnly);

  let hasChanges = $derived(
    disableSignup !== ($currentOrg?.disableSignup ?? false) ||
      disableSignupMessage !== ($currentOrg?.disableSignupMessage ?? '') ||
      allowPublicSignups !== currentAllowPublicSignups ||
      disableEmailPassword !== ($currentOrg?.disableEmailPassword ?? false) ||
      disableGoogleAuth !== ($currentOrg?.disableGoogleAuth ?? false) ||
      internalEnrollmentOnly !== ($currentOrg?.settings?.internalEnrollmentOnly ?? false) ||
      membersOnlyCatalog !== ($currentOrg?.settings?.membersOnlyCatalog ?? false) ||
      autoEnrollMembers !== isAutoEnrollMembersEnabled($currentOrg?.settings) ||
      hideCoursePricing !== readCatalogSettings($currentOrg?.settings).hideCoursePricing ||
      showCourseTypeFilter !== readCatalogSettings($currentOrg?.settings).showCourseTypeFilter ||
      selectedFilterGroupIds.size !== storedFilterGroupIds.length ||
      storedFilterGroupIds.some((id) => !selectedFilterGroupIds.has(id))
  );

  const storedFilterGroupIds = $derived.by(() => {
    const catalog = readCatalogSettings($currentOrg?.settings);
    if (catalog.catalogFilterTagGroupIds) return [...catalog.catalogFilterTagGroupIds].sort();

    return tagApi.tagGroups.map((group) => group.id).sort();
  });

  const allFilterGroupsSelected = $derived(tagApi.tagGroups.every((group) => selectedFilterGroupIds.has(group.id)));

  function toggleFilterGroup(groupId: string, checked: boolean) {
    if (checked) {
      selectedFilterGroupIds.add(groupId);
      return;
    }

    selectedFilterGroupIds.delete(groupId);
  }

  $effect(() => {
    hasUnsavedChanges = hasChanges;
  });

  export async function handleSave() {
    if (!$currentOrg) return;

    isSaving = true;
    // Merge with existing settings to avoid overwriting other keys
    const existingSettings = ($currentOrg.settings as Record<string, unknown>) || {};
    const existingSignup = (existingSettings.signup as Record<string, unknown>) || {};

    await orgApi.update(
      $currentOrg.id,
      {
        disableSignup,
        disableSignupMessage,
        settings: {
          ...existingSettings,
          signup: {
            ...existingSignup,
            inviteOnly: !allowPublicSignups
          },
          internalEnrollmentOnly,
          membersOnlyCatalog,
          autoEnrollMembers,
          hideCoursePricing,
          showCourseTypeFilter,
          catalogFilterTagGroupIds: allFilterGroupsSelected ? null : [...selectedFilterGroupIds]
        },
        disableEmailPassword,
        disableGoogleAuth
      },
      {
        onSuccess: () => {
          snackbar.success(t.get('snackbar.success_update'));
        }
      }
    );
    isSaving = false;
  }

  export function handleDiscard() {
    if (!$currentOrg) return;

    disableSignup = $currentOrg.disableSignup ?? false;
    disableSignupMessage = $currentOrg.disableSignupMessage ?? '';
    allowPublicSignups = !$currentOrg.settings?.signup?.inviteOnly;
    disableEmailPassword = $currentOrg.disableEmailPassword ?? false;
    disableGoogleAuth = $currentOrg.disableGoogleAuth ?? false;
    internalEnrollmentOnly = $currentOrg.settings?.internalEnrollmentOnly ?? false;
    membersOnlyCatalog = $currentOrg.settings?.membersOnlyCatalog ?? false;
    autoEnrollMembers = isAutoEnrollMembersEnabled($currentOrg.settings);
    const catalog = readCatalogSettings($currentOrg.settings);
    hideCoursePricing = catalog.hideCoursePricing;
    showCourseTypeFilter = catalog.showCourseTypeFilter;
    const ids = catalog.catalogFilterTagGroupIds ?? tagApi.tagGroups.map((group) => group.id);
    selectedFilterGroupIds.clear();
    for (const id of ids) selectedFilterGroupIds.add(id);
    hasUnsavedChanges = false;
  }
</script>

<Field.Group class="w-full max-w-2xl! px-2">
  <Field.Set>
    <Field.Legend class="flex items-center gap-2">
      <LockIcon class="size-5" />
      {$t('settings.auth.general.heading')}
    </Field.Legend>
    <Field.Description>
      {$t('settings.auth.general.description')}
    </Field.Description>

    <div class="mt-4 space-y-4">
      <!-- Disable Signup -->
      <Field.Field orientation="horizontal">
        <Switch bind:checked={disableSignup} disabled={!$isEnterprisePlan || isSaving} />
        <div class="space-y-0.5">
          <Field.Label class="flex items-center gap-2">
            {$t('settings.auth.general.disable_signup.label')}
            <UpgradeLock locked={!$isEnterprisePlan} />
          </Field.Label>
          <Field.Description>
            {$t('settings.auth.general.disable_signup.description')}
          </Field.Description>
        </div>
      </Field.Field>

      <!-- Allow Public Signups (invite-only when off) -->
      <Field.Field orientation="horizontal">
        <Switch bind:checked={allowPublicSignups} disabled={!$hasBasicAuthSettingsAccess || isSaving} />
        <div class="space-y-0.5">
          <Field.Label class="flex items-center gap-2">
            {$t('settings.auth.general.allow_public_signups.label')}
            <UpgradeLock locked={!$hasBasicAuthSettingsAccess} />
          </Field.Label>
          <Field.Description>
            {$t('settings.auth.general.allow_public_signups.description')}
          </Field.Description>
        </div>
      </Field.Field>

      <!-- Internal Enrollment Only -->
      <Field.Field orientation="horizontal">
        <Switch bind:checked={internalEnrollmentOnly} disabled={!$hasBasicAuthSettingsAccess || isSaving} />
        <div class="space-y-0.5">
          <Field.Label class="flex items-center gap-2">
            {$t('settings.auth.general.internal_enrollment_only.label')}
            <UpgradeLock locked={!$hasBasicAuthSettingsAccess} />
          </Field.Label>
          <Field.Description>
            {$t('settings.auth.general.internal_enrollment_only.description')}
          </Field.Description>
        </div>
      </Field.Field>

      <Field.Field orientation="horizontal">
        <Switch
          bind:checked={membersOnlyCatalog}
          disabled={isSaving}
          onCheckedChange={(checked) => {
            if (checked && $currentOrg?.settings?.autoEnrollMembers !== false) {
              autoEnrollMembers = true;
            }
          }}
        />
        <div class="space-y-0.5">
          <Field.Label>{$t('settings.auth.general.members_only_catalog.label')}</Field.Label>
          <Field.Description>
            {$t('settings.auth.general.members_only_catalog.description')}
          </Field.Description>
        </div>
      </Field.Field>

      <Field.Field orientation="horizontal">
        <Switch bind:checked={autoEnrollMembers} disabled={isSaving} />
        <div class="space-y-0.5">
          <Field.Label>{$t('settings.auth.general.auto_enroll_members.label')}</Field.Label>
          <Field.Description>
            {$t('settings.auth.general.auto_enroll_members.description')}
          </Field.Description>
        </div>
      </Field.Field>

      <Field.Field orientation="horizontal">
        <Switch bind:checked={hideCoursePricing} disabled={isSaving} />
        <div class="space-y-0.5">
          <Field.Label>{$t('settings.auth.general.hide_course_pricing.label')}</Field.Label>
          <Field.Description>
            {$t('settings.auth.general.hide_course_pricing.description')}
          </Field.Description>
        </div>
      </Field.Field>

      <Field.Field orientation="horizontal">
        <Switch bind:checked={showCourseTypeFilter} disabled={isSaving} />
        <div class="space-y-0.5">
          <Field.Label>{$t('settings.auth.general.show_course_type_filter.label')}</Field.Label>
          <Field.Description>
            {$t('settings.auth.general.show_course_type_filter.description')}
          </Field.Description>
        </div>
      </Field.Field>

      <Field.Field>
        <Field.Label>{$t('settings.auth.general.catalog_filter_groups.label')}</Field.Label>
        <Field.Description>
          {$t('settings.auth.general.catalog_filter_groups.description')}
        </Field.Description>
        {#if tagApi.tagGroups.length === 0}
          <p class="ui:text-muted-foreground text-sm">
            {$t('settings.auth.general.catalog_filter_groups.empty')}
          </p>
        {:else}
          <div class="mt-2 space-y-2">
            {#each tagApi.tagGroups as group (group.id)}
              <label class="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={selectedFilterGroupIds.has(group.id)}
                  disabled={isSaving}
                  onCheckedChange={(checked) => toggleFilterGroup(group.id, checked === true)}
                />
                <span>{group.name}</span>
              </label>
            {/each}
          </div>
        {/if}
      </Field.Field>

      <!-- Signup Disabled Message (shown when disableSignup is true) -->
      {#if disableSignup}
        <Field.Field>
          <Field.Label class="flex items-center gap-2">
            {$t('settings.auth.general.disable_signup_message.label')}
            <UpgradeLock locked={!$isEnterprisePlan} />
          </Field.Label>
          <Field.Description>
            {$t('settings.auth.general.disable_signup_message.description')}
          </Field.Description>
          <Textarea
            bind:value={disableSignupMessage}
            placeholder={$t('settings.auth.general.disable_signup_message.placeholder')}
            class="mt-2 w-full"
            disabled={!$isEnterprisePlan || isSaving}
            rows={3}
          />
        </Field.Field>
      {/if}

      <!-- Disable Email/Password Login -->
      <Field.Field orientation="horizontal">
        <Switch bind:checked={disableEmailPassword} disabled={!$isEnterprisePlan || isSaving} />
        <div class="space-y-0.5">
          <Field.Label class="flex items-center gap-2">
            {$t('settings.auth.general.disable_email_password.label')}
            <UpgradeLock locked={!$isEnterprisePlan} />
          </Field.Label>
          <Field.Description>
            {$t('settings.auth.general.disable_email_password.description')}
          </Field.Description>
        </div>
      </Field.Field>

      <!-- Disable Google Auth -->
      <Field.Field orientation="horizontal">
        <Switch bind:checked={disableGoogleAuth} disabled={!$isEnterprisePlan || isSaving} />
        <div class="space-y-0.5">
          <Field.Label class="flex items-center gap-2">
            {$t('settings.auth.general.disable_google_auth.label')}
            <UpgradeLock locked={!$isEnterprisePlan} />
          </Field.Label>
          <Field.Description>
            {$t('settings.auth.general.disable_google_auth.description')}
          </Field.Description>
        </div>
      </Field.Field>
    </div>
  </Field.Set>

  <Field.Separator />

  <!-- Info Box -->
  <Alert.Callout
    variant="information"
    title={$t('settings.auth.general.note_title')}
    description={$t('settings.auth.general.note_description')}
    class="w-full"
  />
</Field.Group>
