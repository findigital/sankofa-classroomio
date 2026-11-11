import { classroomio, type InferResponseType } from '$lib/utils/services/api';

export type MessagingSessionRequest = typeof classroomio.messaging.session.$get;
export type MessagingSessionSuccess = Extract<InferResponseType<MessagingSessionRequest>, { success: true }>;
export type MessagingSession = MessagingSessionSuccess['data'];

export type MessagingDisclosureRequest = typeof classroomio.messaging.disclosure.$post;

export type MessagingChannelsRequest = typeof classroomio.messaging.channels.$get;
export type MessagingChannelsSuccess = Extract<InferResponseType<MessagingChannelsRequest>, { success: true }>;
export type MessagingChannel = MessagingChannelsSuccess['data'][number];

export type MessagingThreadRequest = (typeof classroomio.messaging.channels)[':channelType'][':channelId']['$get'];
export type MessagingThreadSuccess = Extract<InferResponseType<MessagingThreadRequest>, { success: true }>;
export type MessagingThreadMessage = MessagingThreadSuccess['data']['messages'][number];

export type MessagingDirectoryRequest = typeof classroomio.messaging.directory.$get;
export type MessagingDirectorySuccess = Extract<InferResponseType<MessagingDirectoryRequest>, { success: true }>;
export type MessagingDirectoryPerson = MessagingDirectorySuccess['data'][number];

export type OpenDirectMessageRequest = typeof classroomio.messaging.direct.$post;
export type SendMessagingMessageRequest = typeof classroomio.messaging.messages.$post;
export type FlagMessagingMessageRequest = typeof classroomio.messaging.flags.$post;
export type MuteMessagingUserRequest = typeof classroomio.messaging.mutes.$post;
export type UnmuteMessagingUserRequest = (typeof classroomio.messaging.mutes)[':profileId']['$delete'];

export type AdminMessagingChannelsRequest = typeof classroomio.messaging.admin.channels.$get;
export type AdminMessagingThreadRequest =
  (typeof classroomio.messaging.admin.channels)[':channelType'][':channelId']['$get'];
export type ExportMessagingChannelRequest =
  (typeof classroomio.messaging.admin.channels)[':channelType'][':channelId']['export']['$get'];
export type ExportMessagingChannelSuccess = Extract<
  InferResponseType<ExportMessagingChannelRequest>,
  { success: true }
>;
export type MessagingExportFile = ExportMessagingChannelSuccess['data'];

export type MessagingActivityRequest = typeof classroomio.messaging.admin.activity.$get;
export type MessagingActivitySuccess = Extract<InferResponseType<MessagingActivityRequest>, { success: true }>;
export type MessagingActivity = MessagingActivitySuccess['data'];

export type MessagingKeywordsRequest = typeof classroomio.messaging.keywords.$get;
export type MessagingKeywordsSuccess = Extract<InferResponseType<MessagingKeywordsRequest>, { success: true }>;
export type MessagingKeyword = MessagingKeywordsSuccess['data'][number];
export type CreateMessagingKeywordRequest = typeof classroomio.messaging.keywords.$post;
export type DeleteMessagingKeywordRequest = (typeof classroomio.messaging.keywords)[':keywordId']['$delete'];

export type MessagingCohortsRequest = typeof classroomio.messaging.cohorts.$get;
export type MessagingCohortsSuccess = Extract<InferResponseType<MessagingCohortsRequest>, { success: true }>;
export type MessagingCohortSetting = MessagingCohortsSuccess['data'][number];
export type UpdateMessagingCohortRequest = (typeof classroomio.messaging.cohorts)[':groupId']['$put'];

export type SafeguardingStaffRequest = (typeof classroomio.messaging)['safeguarding-staff']['$get'];
export type SafeguardingStaffSuccess = Extract<InferResponseType<SafeguardingStaffRequest>, { success: true }>;
export type SafeguardingStaff = SafeguardingStaffSuccess['data'];
export type UpdateSafeguardingStaffRequest = (typeof classroomio.messaging)['safeguarding-staff']['$put'];
