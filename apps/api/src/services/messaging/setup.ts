import { channelTypeDefinitions } from '@cio/utils/functions/messaging';

import { markMessagingSetup, messagingEnabled, type MessagingSetupState } from './availability';
import { getStreamGateway } from './gateway';

export type MessagingSetupResult = {
  status: MessagingSetupState;
  channelTypes: string[];
};

/**
 * Locks Stream channel types so browser tokens cannot create channels or send messages.
 * A failed setup leaves messaging unavailable and does not issue tokens.
 */
export async function ensureStreamMessagingSetup(): Promise<MessagingSetupResult> {
  if (!messagingEnabled()) {
    markMessagingSetup('disabled');

    return { status: 'disabled', channelTypes: [] };
  }

  if (!process.env.STREAM_API_KEY || !process.env.STREAM_API_SECRET) {
    markMessagingSetup('failed');

    return { status: 'failed', channelTypes: [] };
  }

  try {
    const gateway = getStreamGateway();
    await gateway.ensureChannelTypes();
    const serverUrl = process.env.PUBLIC_SERVER_URL?.replace(/\/$/, '');

    if (serverUrl) {
      await gateway.setBeforeMessageWebhook(`${serverUrl}/messaging/webhook`);
    }

    markMessagingSetup('ready');

    return {
      status: 'ready',
      channelTypes: channelTypeDefinitions().map((definition) => definition.name)
    };
  } catch (error) {
    console.error('ensureStreamMessagingSetup error:', error);
    markMessagingSetup('failed');

    return { status: 'failed', channelTypes: [] };
  }
}
