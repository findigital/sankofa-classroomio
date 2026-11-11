import 'dotenv/config';

import { ensureStreamMessagingSetup } from '@api/services/messaging/setup';

const result = await ensureStreamMessagingSetup();

console.log(
  JSON.stringify({
    status: result.status,
    channelTypes: result.channelTypes
  })
);

if (result.status === 'failed') {
  process.exit(1);
}
