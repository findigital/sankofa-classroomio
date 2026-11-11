import { BaseApiWithErrors, classroomio } from '$lib/utils/services/api';
import { ZMessagingKeyword, ZSendMessagingMessage } from '@cio/utils/validation/messaging';
import type { TMessagingKeyword } from '@cio/utils/validation/messaging';
import { snackbar } from '$features/ui/snackbar/store';

import type {
  AdminMessagingChannelsRequest,
  AdminMessagingThreadRequest,
  CreateMessagingKeywordRequest,
  DeleteMessagingKeywordRequest,
  ExportMessagingChannelRequest,
  FlagMessagingMessageRequest,
  MessagingActivity,
  MessagingActivityRequest,
  MessagingChannel,
  MessagingChannelsRequest,
  MessagingCohortSetting,
  MessagingCohortsRequest,
  MessagingDirectoryPerson,
  MessagingDirectoryRequest,
  MessagingDisclosureRequest,
  MessagingExportFile,
  MessagingKeyword,
  MessagingKeywordsRequest,
  MessagingSession,
  MessagingSessionRequest,
  MessagingThreadMessage,
  MessagingThreadRequest,
  MuteMessagingUserRequest,
  OpenDirectMessageRequest,
  SafeguardingStaff,
  SafeguardingStaffRequest,
  SendMessagingMessageRequest,
  UnmuteMessagingUserRequest,
  UpdateMessagingCohortRequest,
  UpdateSafeguardingStaffRequest
} from '../utils/types';

class MessagingApi extends BaseApiWithErrors {
  session = $state<MessagingSession | null>(null);
  channels = $state<MessagingChannel[] | null>(null);
  adminChannels = $state<MessagingChannel[] | null>(null);
  directory = $state<MessagingDirectoryPerson[] | null>(null);
  messages = $state<MessagingThreadMessage[] | null>(null);
  keywords = $state<MessagingKeyword[] | null>(null);
  cohorts = $state<MessagingCohortSetting[] | null>(null);
  activity = $state<MessagingActivity | null>(null);
  safeguarding = $state<SafeguardingStaff | null>(null);

  async loadSession(options?: { notify?: boolean }) {
    const notify = options?.notify !== false;

    return this.execute<MessagingSessionRequest>({
      requestFn: () => classroomio.messaging.session.$get(),
      logContext: 'opening messaging session',
      onSuccess: (response) => {
        this.session = response.data;
      },
      onError: () => {
        if (notify) snackbar.error('snackbar.messaging.load_failed');
      }
    });
  }

  async acceptDisclosure() {
    const saved = await this.execute<MessagingDisclosureRequest>({
      requestFn: () => classroomio.messaging.disclosure.$post(),
      logContext: 'accepting messaging notice',
      onSuccess: () => {
        if (this.session) this.session.disclosureAccepted = true;

        snackbar.success('snackbar.messaging.accepted');
      },
      onError: () => {
        snackbar.error('snackbar.messaging.load_failed');
      }
    });

    return saved;
  }

  async loadChannels(options?: { notify?: boolean }) {
    const notify = options?.notify !== false;

    return this.execute<MessagingChannelsRequest>({
      requestFn: () => classroomio.messaging.channels.$get(),
      logContext: 'loading conversations',
      onSuccess: (response) => {
        this.channels = response.data;
      },
      onError: () => {
        if (this.channels === null) this.channels = [];

        if (notify) snackbar.error('snackbar.messaging.load_failed');
      }
    });
  }

  async loadDirectory() {
    return this.execute<MessagingDirectoryRequest>({
      requestFn: () => classroomio.messaging.directory.$get(),
      logContext: 'loading messaging directory',
      onSuccess: (response) => {
        this.directory = response.data;
      },
      onError: () => {
        if (this.directory === null) this.directory = [];
      }
    });
  }

  async openDirect(targetProfileId: string) {
    const opened = await this.execute<OpenDirectMessageRequest>({
      requestFn: () => classroomio.messaging.direct.$post({ json: { targetProfileId } }),
      logContext: 'opening direct message',
      onError: () => {
        snackbar.error('snackbar.messaging.send_failed');
      }
    });

    if (opened) await this.loadChannels();

    return opened?.data;
  }

  async loadThread(channelType: string, channelId: string) {
    return this.execute<MessagingThreadRequest>({
      requestFn: () =>
        classroomio.messaging.channels[':channelType'][':channelId'].$get({
          param: { channelType, channelId }
        }),
      logContext: 'loading messages',
      onSuccess: (response) => {
        this.messages = response.data.messages;
      },
      onError: () => {
        this.messages = [];
        snackbar.error('snackbar.messaging.load_failed');
      }
    });
  }

  async send(
    channelType: string,
    channelId: string,
    text: string,
    options?: { quiet?: boolean; id?: string; parentId?: string }
  ) {
    const parsed = ZSendMessagingMessage.safeParse({
      channelType,
      channelId,
      text,
      ...(options?.id ? { id: options.id } : {}),
      ...(options?.parentId ? { parentId: options.parentId } : {})
    });

    if (!parsed.success) {
      snackbar.error('snackbar.messaging.send_failed');
      return;
    }

    const sent = await this.execute<SendMessagingMessageRequest>({
      requestFn: () => classroomio.messaging.messages.$post({ json: parsed.data }),
      logContext: 'sending message',
      onSuccess: () => {
        if (!options?.quiet) snackbar.success('snackbar.messaging.sent');
      },
      onError: (result) => {
        if (typeof result === 'object' && result && 'code' in result && result.code === 'MESSAGING_MESSAGE_BLOCKED') {
          snackbar.error('snackbar.messaging.blocked');
          return;
        }

        snackbar.error('snackbar.messaging.send_failed');
      }
    });

    if (sent && !options?.quiet) await this.loadThread(channelType, channelId);

    return sent;
  }

  async flag(channelType: string, channelId: string, messageId: string) {
    return this.execute<FlagMessagingMessageRequest>({
      requestFn: () =>
        classroomio.messaging.flags.$post({
          json: { channelType, channelId, messageId }
        }),
      logContext: 'flagging message',
      onSuccess: () => {
        snackbar.success('snackbar.messaging.flagged');
      },
      onError: () => {
        snackbar.error('snackbar.messaging.load_failed');
      }
    });
  }

  async mute(profileId: string) {
    return this.execute<MuteMessagingUserRequest>({
      requestFn: () => classroomio.messaging.mutes.$post({ json: { profileId } }),
      logContext: 'muting messaging user',
      onSuccess: () => {
        snackbar.success('snackbar.messaging.muted');
      },
      onError: () => {
        snackbar.error('snackbar.messaging.load_failed');
      }
    });
  }

  async unmute(profileId: string) {
    return this.execute<UnmuteMessagingUserRequest>({
      requestFn: () => classroomio.messaging.mutes[':profileId'].$delete({ param: { profileId } }),
      logContext: 'unmuting messaging user',
      onError: () => {
        snackbar.error('snackbar.messaging.load_failed');
      }
    });
  }

  async loadAdminChannels() {
    return this.execute<AdminMessagingChannelsRequest>({
      requestFn: () => classroomio.messaging.admin.channels.$get(),
      logContext: 'loading organization conversations',
      onSuccess: (response) => {
        this.adminChannels = response.data;
      },
      onError: () => {
        if (this.adminChannels === null) this.adminChannels = [];
      }
    });
  }

  async loadAdminThread(channelType: string, channelId: string) {
    return this.execute<AdminMessagingThreadRequest>({
      requestFn: () =>
        classroomio.messaging.admin.channels[':channelType'][':channelId'].$get({
          param: { channelType, channelId }
        }),
      logContext: 'loading organization conversation',
      onSuccess: (response) => {
        this.messages = response.data.messages;
      },
      onError: () => {
        this.messages = [];
        snackbar.error('snackbar.messaging.load_failed');
      }
    });
  }

  async exportChannel(channelType: string, channelId: string, format: 'json' | 'csv') {
    return this.execute<ExportMessagingChannelRequest>({
      requestFn: () =>
        classroomio.messaging.admin.channels[':channelType'][':channelId'].export.$get({
          param: { channelType, channelId },
          query: { format }
        }),
      logContext: 'exporting conversation',
      onSuccess: () => {
        snackbar.success('snackbar.messaging.exported');
      },
      onError: () => {
        snackbar.error('snackbar.messaging.load_failed');
      }
    });
  }

  downloadExport(file: MessagingExportFile) {
    const blob = new Blob([file.body], { type: file.contentType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  async loadActivity() {
    return this.execute<MessagingActivityRequest>({
      requestFn: () => classroomio.messaging.admin.activity.$get(),
      logContext: 'loading messaging activity',
      onSuccess: (response) => {
        this.activity = response.data;
      },
      onError: () => {
        snackbar.error('snackbar.messaging.load_failed');
      }
    });
  }

  async loadKeywords() {
    return this.execute<MessagingKeywordsRequest>({
      requestFn: () => classroomio.messaging.keywords.$get(),
      logContext: 'loading messaging keywords',
      onSuccess: (response) => {
        this.keywords = response.data;
      },
      onError: () => {
        if (this.keywords === null) this.keywords = [];
      }
    });
  }

  async addKeyword(fields: TMessagingKeyword) {
    const parsed = ZMessagingKeyword.safeParse(fields);

    if (!parsed.success) {
      snackbar.error('snackbar.messaging.load_failed');
      return;
    }

    const saved = await this.execute<CreateMessagingKeywordRequest>({
      requestFn: () => classroomio.messaging.keywords.$post({ json: parsed.data }),
      logContext: 'saving messaging keyword',
      onSuccess: () => {
        snackbar.success('snackbar.messaging.keyword_saved');
      },
      onError: () => {
        snackbar.error('snackbar.messaging.load_failed');
      }
    });

    if (saved) await this.loadKeywords();

    return saved;
  }

  async removeKeyword(keywordId: string) {
    const removed = await this.execute<DeleteMessagingKeywordRequest>({
      requestFn: () => classroomio.messaging.keywords[':keywordId'].$delete({ param: { keywordId } }),
      logContext: 'deleting messaging keyword',
      onError: () => {
        snackbar.error('snackbar.messaging.load_failed');
      }
    });

    if (removed) await this.loadKeywords();

    return removed;
  }

  async loadCohorts() {
    return this.execute<MessagingCohortsRequest>({
      requestFn: () => classroomio.messaging.cohorts.$get(),
      logContext: 'loading cohort messaging',
      onSuccess: (response) => {
        this.cohorts = response.data;
      },
      onError: () => {
        if (this.cohorts === null) this.cohorts = [];
      }
    });
  }

  async setFellowDm(groupId: string, fellowDmEnabled: boolean) {
    const saved = await this.execute<UpdateMessagingCohortRequest>({
      requestFn: () =>
        classroomio.messaging.cohorts[':groupId'].$put({
          param: { groupId },
          json: { fellowDmEnabled }
        }),
      logContext: 'saving cohort messaging',
      onSuccess: () => {
        snackbar.success('snackbar.messaging.saved');
      },
      onError: () => {
        snackbar.error('snackbar.messaging.load_failed');
      }
    });

    if (saved) await this.loadCohorts();

    return saved;
  }

  async loadSafeguarding() {
    return this.execute<SafeguardingStaffRequest>({
      requestFn: () => classroomio.messaging['safeguarding-staff'].$get(),
      logContext: 'loading safeguarding staff',
      onSuccess: (response) => {
        this.safeguarding = response.data;
      },
      onError: () => {
        snackbar.error('snackbar.messaging.load_failed');
      }
    });
  }

  async saveSafeguarding(staffIds: string[] | null) {
    const saved = await this.execute<UpdateSafeguardingStaffRequest>({
      requestFn: () => classroomio.messaging['safeguarding-staff'].$put({ json: { staffIds } }),
      logContext: 'saving safeguarding staff',
      onSuccess: (response) => {
        this.safeguarding = response.data;
        snackbar.success('snackbar.messaging.saved');
      },
      onError: () => {
        snackbar.error('snackbar.messaging.load_failed');
      }
    });

    return saved?.data;
  }
}

export const messagingApi = new MessagingApi();
