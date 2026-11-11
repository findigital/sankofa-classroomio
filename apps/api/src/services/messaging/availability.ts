import { AppError, ErrorCodes } from '@api/utils/errors';

export type MessagingSetupState = 'pending' | 'ready' | 'failed' | 'disabled';

let setupState: MessagingSetupState = 'pending';

export function messagingEnabled(): boolean {
  return process.env.MESSAGING_ENABLED === 'true';
}

export function markMessagingSetup(state: MessagingSetupState): void {
  setupState = state;
}

export function messagingSetupState(): MessagingSetupState {
  return setupState;
}

/** Refuses the request unless messaging is on and the Stream channel types were locked. */
export function assertMessagingAvailable(): void {
  if (!messagingEnabled()) {
    throw new AppError('Messaging is not enabled', ErrorCodes.MESSAGING_DISABLED, 404);
  }

  if (setupState !== 'ready') {
    throw new AppError('Messaging is not ready', ErrorCodes.MESSAGING_NOT_CONFIGURED, 503);
  }
}
