import { BOT_APPLY_FILE, BOT_GUILD_FILE } from "./data/bot-files";
import type { ApplyFormRow, GuildSettings, TicketTypeRow } from "./types";

type Raw = Record<string, unknown>;

export type PrimeInput = {
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
};

const THEMES = new Set(["gaming", "community", "professional", "anime"]);

function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  return "";
}

function objectOf(value: unknown): Raw {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : {};
}

function snowflakeOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return Number(trimmed);
}

export function fileGuild(guildId: string): Raw | null {
  const row = BOT_GUILD_FILE[guildId];
  return row ? structuredClone(row) : null;
}

export function ticketTypesOf(raw: Raw | null): TicketTypeRow[] {
  const types = objectOf(raw?.ticket_types);
  return Object.entries(types).map(([id, row]) => {
    const item = objectOf(row);
    return { id, name: text(item.name) || id, label: text(item.label) };
  });
}

export function applyFormsFor(guildId: string): ApplyFormRow[] {
  const apps = BOT_APPLY_FILE[guildId] ?? {};
  return Object.entries(apps).map(([name, cfg]) => {
    const questions = Array.isArray(cfg.questions) ? cfg.questions : [];
    return {
      name,
      title: text(cfg.embed_title) || name,
      questions: questions.map((item) => text(objectOf(item).text)).filter(Boolean),
      channelId: text(cfg.channel_id),
      staffRoleId: text(cfg.staff_role_id),
      logChannelId: text(cfg.log_channel_id),
    };
  });
}

export function knownApplyGuildIds(): string[] {
  return Object.keys(BOT_APPLY_FILE);
}

export function toSettings(
  raw: Raw | null,
  meta: { updatedAt: string | null; updatedBy: string | null; usingBotFile: boolean },
  guildId: string,
): GuildSettings {
  const source = raw ?? {};
  const verification = objectOf(source.verification);
  const words = Array.isArray(source.banned_words)
    ? source.banned_words.filter((word): word is string => typeof word === "string")
    : [];
  const style = text(source.ticket_panel_style);
  const theme = text(source.theme);
  return {
    theme: THEMES.has(theme) ? theme : "community",
    welcomeEnabled: source.welcome_enabled === true,
    welcomeChannelId: text(source.welcome_channel),
    welcomeMessage: text(source.welcome_message),
    leaveEnabled: source.leave_enabled === true,
    leaveChannelId: text(source.leave_channel),
    leaveMessage: text(source.leave_message),
    joinRoleId: text(source.join_role),
    automod: source.automod === true,
    linkFilter: source.link_filter === true,
    bannedWords: words.join("\n"),
    levelChannelId: text(source.level_channel),
    ticketPanelStyle: style === "dropdown" ? "dropdown" : "button",
    ticketCategoryId: text(source.ticket_category),
    verificationEnabled: verification.enabled === true,
    verificationChannelId: text(verification.channel_id),
    verifiedRoleId: text(verification.verified_role_id),
    unverifiedRoleId: text(verification.unverified_role_id),
    verificationMethod: text(verification.method) || "button",
    ticketTypes: ticketTypesOf(source),
    applyForms: applyFormsFor(guildId),
    updatedAt: meta.updatedAt,
    updatedBy: meta.updatedBy,
    usingBotFile: meta.usingBotFile,
  };
}

export function mergeConfig(base: Raw | null, input: PrimeInput): Raw {
  const next: Raw = { ...(base ?? {}) };
  next.theme = THEMES.has(input.theme) ? input.theme : "community";
  next.welcome_enabled = input.welcomeEnabled;
  next.welcome_channel = snowflakeOrNull(input.welcomeChannelId);
  next.welcome_message = input.welcomeMessage.slice(0, 2000);
  next.leave_enabled = input.leaveEnabled;
  next.leave_channel = snowflakeOrNull(input.leaveChannelId);
  next.leave_message = input.leaveMessage.slice(0, 2000);
  next.join_role = snowflakeOrNull(input.joinRoleId);
  next.automod = input.automod;
  next.link_filter = input.linkFilter;
  next.banned_words = [...new Set(input.bannedWords.split(/[\n,]/).map((word) => word.trim().toLowerCase()).filter(Boolean))].slice(0, 100);
  next.level_channel = snowflakeOrNull(input.levelChannelId);
  next.ticket_panel_style = input.ticketPanelStyle === "dropdown" ? "dropdown" : "button";
  next.ticket_category = snowflakeOrNull(input.ticketCategoryId);
  const verification = objectOf(next.verification);
  verification.enabled = input.verificationEnabled;
  verification.channel_id = snowflakeOrNull(input.verificationChannelId);
  verification.verified_role_id = snowflakeOrNull(input.verifiedRoleId);
  verification.unverified_role_id = snowflakeOrNull(input.unverifiedRoleId);
  verification.method = input.verificationMethod === "reaction" ? "reaction" : "button";
  next.verification = verification;
  return next;
}
