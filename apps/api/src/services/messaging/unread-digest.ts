import { planUnreadMessageDigest, type UnreadDigestPlan } from '@cio/utils/functions/messaging';

import { messagingEnabled } from './availability';

function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_SENDER);
}

/**
 * Hook for a later unread-message email.
 * Returns a deferred plan and does not send mail.
 */
export function runUnreadMessageDigest(): UnreadDigestPlan {
  return planUnreadMessageDigest({
    messagingEnabled: messagingEnabled(),
    smtpConfigured: smtpConfigured()
  });
}
