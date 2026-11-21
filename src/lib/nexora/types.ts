import type { AccessLevel } from "./pure";

export type Metric =
  | { state: "value"; value: string; hint?: string }
  | { state: "unavailable"; reason: string };

export type IntegrationStatus = {
  database: { ok: boolean; latencyMs: number | null; source: "neon" | "pglite" };
  oauthConfigured: boolean;
  sessionSecretConfigured: boolean;
  botTokenConfigured: boolean;
  runtimeConfigured: boolean;
  ownerConfigured: boolean;
  botIdMismatch: boolean;
  botId: string;
  redirectUri: string | null;
  missing: string[];
  runtimeUrlError: string | null;
};

export type PublicUser = {
  id: string;
  username: string;
  globalName: string | null;
  avatarUrl: string;
  email: string | null;
};

export type SessionView =
  | { authenticated: false }
  | {
      authenticated: true;
      user: PublicUser;
      csrfToken: string;
      expiresAt: string;
      isOwner: boolean;
      guildsStale: boolean;
    };

export type GuildSummary = {
  id: string;
  name: string;
  iconUrl: string | null;
  access: AccessLevel;
  canManage: boolean;
  botPresent: "yes" | "no" | "unknown";
};

export type GuildList = {
  guilds: GuildSummary[];
  botPresence: "known" | "unknown";
  presenceDetail: string;
  guildsStale: boolean;
  inviteUrl: string | null;
};

export type BotCard = {
  expectedBotId: string;
  configurationError: string | null;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  applicationId: string | null;
  createdAt: string | null;
  gateway: Metric;
  uptime: Metric;
  latency: Metric;
  guildCount: Metric;
  memberCount: Metric;
  userCount: Metric;
  verification: "verified" | "not_confirmed" | "unavailable";
  inviteUrl: string | null;
  restReachable: boolean;
  refreshedAt: string | null;
  notes: string[];
};

export type ActivityItem = {
  id: string;
  at: string;
  guildId: string | null;
  kind: string;
  level: string;
  message: string;
  actorId: string | null;
};

export type Overview = {
  bot: BotCard;
  health: IntegrationStatus;
  applications: { pending: number; approved: number; rejected: number };
  recent: ActivityItem[];
  moderation: ActivityItem[];
};

export type TicketTypeRow = { id: string; name: string; label: string };

export type ApplyFormRow = {
  name: string;
  title: string;
  questions: string[];
  channelId: string;
  staffRoleId: string;
  logChannelId: string;
};

export type GuildSettings = {
  theme: string;
  welcomeEnabled: boolean;
  welcomeChannelId: string;
  welcomeMessage: string;
  leaveEnabled: boolean;
  leaveChannelId: string;
  leaveMessage: string;
  joinRoleId: string;
  automod: boolean;
  linkFilter: boolean;
  bannedWords: string;
  levelChannelId: string;
  ticketPanelStyle: string;
  ticketCategoryId: string;
  verificationEnabled: boolean;
  verificationChannelId: string;
  verifiedRoleId: string;
  unverifiedRoleId: string;
  verificationMethod: string;
  ticketTypes: TicketTypeRow[];
  applyForms: ApplyFormRow[];
  updatedAt: string | null;
  updatedBy: string | null;
  usingBotFile: boolean;
};

export type BotFormGroup = {
  guildId: string;
  guildName: string | null;
  forms: ApplyFormRow[];
};

export type GuildDetail = {
  guild: GuildSummary;
  settings: GuildSettings;
  liveName: string | null;
  memberCount: Metric;
  onlineCount: Metric;
  moderation: ActivityItem[];
  applications: { pending: number; total: number };
};

export type Answer = { question: string; answer: string };

export type ApplicationRow = {
  id: string;
  guildId: string;
  guildName: string | null;
  applicantId: string;
  applicantName: string;
  answers: Answer[];
  status: "pending" | "approved" | "rejected";
  reviewerId: string | null;
  reviewerNote: string;
  createdAt: string;
  updatedAt: string;
  canReview: boolean;
};

export type LogPage = {
  items: ActivityItem[];
  page: number;
  pageSize: number;
  total: number;
};

export type OwnerConsole = {
  bot: BotCard;
  health: IntegrationStatus;
  applications: { pending: number; approved: number; rejected: number };
  recentErrors: ActivityItem[];
  sessionCount: number;
};

export type MutationResult = { ok: true } | { ok: false; error: string };
