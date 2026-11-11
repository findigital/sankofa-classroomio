import { listMessagingAdmins, readSafeguardingStaffIds, writeSafeguardingStaffIds } from '@cio/db/queries/messaging';

import { assertMessagingAvailable } from './availability';

export type SafeguardingStaffAdmin = {
  profileId: string;
  name: string;
};

export type SafeguardingStaffSetting = {
  configured: boolean;
  staffIds: string[];
  admins: SafeguardingStaffAdmin[];
};

async function eligibleAdmins(organizationId: string): Promise<SafeguardingStaffAdmin[]> {
  const admins = await listMessagingAdmins(organizationId);

  return admins
    .filter((admin) => !admin.isMinor)
    .map((admin) => ({
      profileId: admin.profileId,
      name: admin.name || admin.profileId
    }));
}

/** Returns the saved list. `configured` is false when the org still uses every administrator. */
export async function getSafeguardingStaff(organizationId: string): Promise<SafeguardingStaffSetting> {
  assertMessagingAvailable();

  const configuredIds = await readSafeguardingStaffIds(organizationId);
  const admins = await eligibleAdmins(organizationId);

  return {
    configured: configuredIds !== null,
    staffIds: configuredIds ?? [],
    admins
  };
}

/**
 * Saves who is added to an adult–minor direct message.
 * `null` clears the list. Ids that are not non-minor admins are dropped.
 */
export async function setSafeguardingStaff(
  organizationId: string,
  staffIds: string[] | null
): Promise<SafeguardingStaffSetting> {
  assertMessagingAvailable();

  if (staffIds === null) {
    await writeSafeguardingStaffIds(organizationId, null);

    return getSafeguardingStaff(organizationId);
  }

  const admins = await eligibleAdmins(organizationId);
  const allowed = new Set(admins.map((admin) => admin.profileId));
  const saved = [...new Set(staffIds.filter((profileId) => allowed.has(profileId)))];

  await writeSafeguardingStaffIds(organizationId, saved);

  return {
    configured: true,
    staffIds: saved,
    admins
  };
}
