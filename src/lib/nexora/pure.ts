export const NEXORA_BOT_ID = "1526080216852725901";
export const SESSION_COOKIE = "nx_session";
export const STATE_COOKIE = "nx_oauth_state";
export const DISCORD_EPOCH = 1420070400000n;
export const VERIFIED_BOT_FLAG = 1 << 16;
export const SNOWFLAKE = /^\d{17,20}$/;

export type AccessLevel = "owner" | "administrator" | "manage" | "member";

const ADMINISTRATOR = 0x8n;
const MANAGE_GUILD = 0x20n;

export function snowflakeDateIso(id: string): string | null {
  if (!SNOWFLAKE.test(id)) return null;
  const ms = (BigInt(id) >> 22n) + DISCORD_EPOCH;
  return new Date(Number(ms)).toISOString();
}

export function accessLevel(owner: boolean, permissions: string): AccessLevel {
  if (owner) return "owner";
  let bits: bigint;
  try {
    bits = BigInt(permissions);
  } catch {
    return "member";
  }
  if ((bits & ADMINISTRATOR) === ADMINISTRATOR) return "administrator";
  if ((bits & MANAGE_GUILD) === MANAGE_GUILD) return "manage";
  return "member";
}

export function canManageGuild(owner: boolean, permissions: string): boolean {
  const level = accessLevel(owner, permissions);
  return level !== "member";
}

export function verificationFromFlags(
  flags: number | null | undefined,
): "verified" | "not_confirmed" {
  if (typeof flags !== "number") return "not_confirmed";
  return (flags & VERIFIED_BOT_FLAG) === VERIFIED_BOT_FLAG ? "verified" : "not_confirmed";
}

export function identityGate(actualId: string | null | undefined):
  | { state: "unavailable" }
  | { state: "mismatch"; actualId: string }
  | { state: "match" } {
  if (!actualId) return { state: "unavailable" };
  if (actualId !== NEXORA_BOT_ID) return { state: "mismatch", actualId };
  return { state: "match" };
}

export function discordAvatarUrl(id: string, avatar: string | null | undefined): string {
  if (avatar) {
    const ext = avatar.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${id}/${avatar}.${ext}?size=128`;
  }
  let index = 0;
  try {
    index = Number((BigInt(id) >> 22n) % 6n);
  } catch {
    index = 0;
  }
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

export function guildIconUrl(id: string, icon: string | null | undefined): string | null {
  if (!icon) return null;
  const ext = icon.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/icons/${id}/${icon}.${ext}?size=128`;
}

export function inviteUrl(clientId: string | null): string | null {
  if (!clientId || !SNOWFLAKE.test(clientId)) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    scope: "bot applications.commands",
    permissions: "0",
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export function redact(input: string): string {
  return input
    .replace(/Bot\s+[A-Za-z0-9._-]{20,}/g, "Bot [redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]{20,}/g, "Bearer [redacted]")
    .replace(/sdevc_[A-Za-z0-9]+/g, "sdevc_[redacted]")
    .replace(
      /(client_secret|access_token|refresh_token|SESSION_SECRET|BOT_RUNTIME_SECRET|NEXORA_MONITOR_SECRET|DISCORD_BOT_TOKEN|DISCORD_CLIENT_SECRET)(["']?\s*[:=]\s*["']?)[^\s"'&,}]+/gi,
      "$1$2[redacted]",
    );
}

export function safeSearch(raw: string): string {
  return raw.replace(/[%_\\]/g, "").trim().slice(0, 80);
}

export function tokensMatch(a: string | undefined, b: string | null, known: boolean): boolean {
  if (!known || !a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function mapTokenStatus(status: number): "invalid_code" | "discord_down" {
  if (status === 400 || status === 401) return "invalid_code";
  return "discord_down";
}

export type Bucket = { n: number; reset: number };

export function rateLimit(
  bucket: Bucket | undefined,
  now: number,
  limit: number,
  windowMs: number,
): { ok: boolean; next: Bucket } {
  if (!bucket || now >= bucket.reset) return { ok: true, next: { n: 1, reset: now + windowMs } };
  if (bucket.n >= limit) return { ok: false, next: bucket };
  return { ok: true, next: { n: bucket.n + 1, reset: bucket.reset } };
}

const BLOCKED_HOSTS = new Set(["169.254.169.254", "metadata.google.internal"]);

function isPrivateHost(host: string): boolean {
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return false;
  const parts = match.slice(1).map(Number);
  if (parts.some((part) => part > 255)) return false;
  const a = parts[0] ?? 0;
  const b = parts[1] ?? 0;
  if (a === 10 || a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

export function runtimeUrlError(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "BOT_RUNTIME_URL is not a valid URL.";
  }
  if (url.username || url.password) return "BOT_RUNTIME_URL must not include credentials.";
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTS.has(host)) return "BOT_RUNTIME_URL host is not allowed.";
  if (url.protocol === "https:") return null;
  if (url.protocol === "http:" && isPrivateHost(host)) return null;
  return "BOT_RUNTIME_URL must be https, or http on localhost or a private network.";
}

export function isSnowflake(value: string): boolean {
  return value === "" || SNOWFLAKE.test(value);
}

export function missingOauthPieces(input: {
  clientId: string | null;
  clientSecret: string | null;
  sessionSecret: string | null;
  botIdMismatch: boolean;
}): string[] {
  const missing: string[] = [];
  if (input.botIdMismatch) missing.push("DISCORD_BOT_ID");
  if (!input.clientId) missing.push("DISCORD_CLIENT_ID");
  if (!input.clientSecret) missing.push("DISCORD_CLIENT_SECRET");
  if (!input.sessionSecret) missing.push("SESSION_SECRET");
  return missing;
}

export function gatewayLatencyLabel(ms: number): "Excellent" | "Good" | "Moderate" | "High" {
  if (ms < 100) return "Excellent";
  if (ms <= 200) return "Good";
  if (ms <= 350) return "Moderate";
  return "High";
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${total % 60}s`;
}

export function accessLabel(level: AccessLevel): string {
  if (level === "owner") return "Server owner";
  if (level === "administrator") return "Administrator";
  if (level === "manage") return "Manage server";
  return "Member";
}
