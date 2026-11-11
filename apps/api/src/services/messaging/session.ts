import { hasMessagingDisclosure, listMessagingProfiles, acceptMessagingDisclosure } from '@cio/db/queries/messaging';
import { AppError, ErrorCodes } from '@api/utils/errors';

import { assertMessagingAvailable } from './availability';
import { type StreamGateway } from './gateway';

const TOKEN_TTL_SECONDS = 60 * 60;

export type MessagingSession = {
  apiKey: string;
  token: string;
  userId: string;
  userName: string;
  disclosureAccepted: boolean;
  expiresAt: string;
};

/** Upserts the signed-in profile in Stream and returns a one-hour user token. */
export async function issueMessagingSession(
  organizationId: string,
  profileId: string,
  gateway: StreamGateway
): Promise<MessagingSession> {
  assertMessagingAvailable();

  const apiKey = process.env.STREAM_API_KEY;

  if (!apiKey) {
    throw new AppError('Messaging is not ready', ErrorCodes.MESSAGING_NOT_CONFIGURED, 503);
  }

  const profiles = await listMessagingProfiles(organizationId, [profileId]);
  const profile = profiles[0];

  if (!profile) {
    throw new AppError('You are not in this organization', ErrorCodes.MESSAGING_FORBIDDEN, 403);
  }

  const userName = profile.name || profile.profileId;
  await gateway.upsertUsers([
    {
      id: profile.profileId,
      name: userName,
      ...(profile.avatarUrl ? { image: profile.avatarUrl } : {})
    }
  ]);

  const expiresAtUnix = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const token = gateway.createToken(profile.profileId, expiresAtUnix);
  const disclosureAccepted = await hasMessagingDisclosure(organizationId, profileId);

  return {
    apiKey,
    token,
    userId: profile.profileId,
    userName,
    disclosureAccepted,
    expiresAt: new Date(expiresAtUnix * 1000).toISOString()
  };
}

export async function acceptStaffDisclosure(
  organizationId: string,
  profileId: string
): Promise<{ acceptedAt: string }> {
  assertMessagingAvailable();

  return acceptMessagingDisclosure(organizationId, profileId);
}
