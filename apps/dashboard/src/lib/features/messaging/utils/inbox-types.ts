export type InboxChannel = {
  channelType: string;
  channelId: string;
  name: string;
  purpose: string;
};

export type InboxDirectoryPerson = {
  profileId: string;
  name: string;
};

export type InboxLabels = {
  flag: string;
  mute: string;
  back: string;
  directory: string;
  open: string;
  export: string;
  exportCsv: string;
  empty: string;
  select: string;
};

export type InboxViewProps = {
  apiKey: string;
  token: string;
  userId: string;
  userName: string;
  organizationId: string;
  channels: InboxChannel[];
  directory: InboxDirectoryPerson[];
  disclosureAccepted: boolean;
  canPostAnnouncements: boolean;
  roleIsAdmin: boolean;
  focusKey: string | null;
  labels: InboxLabels;
  onSend: (
    channelType: string,
    channelId: string,
    text: string,
    message: { id?: string; parentId?: string }
  ) => Promise<string | null>;
  onFlag: (channelType: string, channelId: string, messageId: string) => void;
  onMute: (userId: string) => void;
  onOpenDirect: (profileId: string) => void;
  onExport: (channelType: string, channelId: string, format: 'json' | 'csv') => void;
};
