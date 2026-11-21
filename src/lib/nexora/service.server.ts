import {
  createCipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { z } from "zod";
import { dbSource, getSql, type Sql } from "@/lib/db";
import { applyFormsFor, fileGuild, knownApplyGuildIds, mergeConfig, toSettings } from "./bot-config";
import { LOCAL_SECRETS } from "./local-secrets.server";
import {
  NEXORA_BOT_ID,
  SNOWFLAKE,
  accessLevel,
  canManageGuild,
  discordAvatarUrl,
  formatDuration,
  gatewayLatencyLabel,
  guildIconUrl,
  identityGate,
  inviteUrl,
  isSnowflake,
  mapTokenStatus,
  missingOauthPieces,
  redact,
  runtimeUrlError,
  safeSearch,
  snowflakeDateIso,
  tokensMatch,
  verificationFromFlags,
} from "./pure";
import type {
  ActivityItem,
  Answer,
  ApplicationRow,
  BotCard,
  BotFormGroup,
  GuildDetail,
  GuildList,
  GuildSettings,
  GuildSummary,
  IntegrationStatus,
  LogPage,
  Metric,
  MutationResult,
  Overview,
  OwnerConsole,
  SessionView,
} from "./types";

const API = "https://discord.com/api/v10";
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const STATE_SECONDS = 10 * 60;

export class NexoraError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "NexoraError";
    this.status = status;
  }
}

type Env = {
  botIdMismatch: boolean;
  clientId: string | null;
  clientSecret: string | null;
  redirectUri: string | null;
  ownerId: string | null;
  sessionSecret: string | null;
  botToken: string | null;
  runtimeUrl: string | null;
  runtimeSecret: string | null;
  sillydevKey: string | null;
  sillydevServer: string | null;
  monitorSecret: string | null;
};

function readEnv(name: string): string | null {
  const fromProcess = process.env[name]?.trim();
  if (fromProcess && !fromProcess.startsWith("YOUR_")) return fromProcess;
  const fallback = LOCAL_SECRETS[name]?.trim();
  if (!fallback || fallback.startsWith("YOUR_")) return null;
  return fallback;
}

export function discordEnv(): Env {
  const botIdEnv = readEnv("DISCORD_BOT_ID");
  return {
    botIdMismatch: Boolean(botIdEnv && botIdEnv !== NEXORA_BOT_ID),
    clientId: readEnv("DISCORD_CLIENT_ID"),
    clientSecret: readEnv("DISCORD_CLIENT_SECRET"),
    redirectUri: readEnv("DISCORD_REDIRECT_URI"),
    ownerId: readEnv("DISCORD_OWNER_ID"),
    sessionSecret: readEnv("SESSION_SECRET"),
    botToken: readEnv("DISCORD_BOT_TOKEN"),
    runtimeUrl: readEnv("BOT_RUNTIME_URL"),
    runtimeSecret: readEnv("BOT_RUNTIME_SECRET"),
    sillydevKey: readEnv("SILLYDEV_API_KEY"),
    sillydevServer: readEnv("SILLYDEV_SERVER_ID"),
    monitorSecret: readEnv("NEXORA_MONITOR_SECRET"),
  };
}

export function originOf(request: Request): string {
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host");
  if (host) return `${proto || "http"}://${host}`;
  return new URL(request.url).origin;
}

export function callbackUrl(request: Request): string {
  const env = discordEnv();
  if (env.redirectUri) return env.redirectUri;
  return `${originOf(request)}/auth/discord/callback`;
}

export function requestIsSecure(request: Request): boolean {
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (proto) return proto === "https";
  return new URL(request.url).protocol === "https:";
}

export function readCookie(request: Request, name: string): string | null {
  const raw = request.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function cookieHeader(name: string, value: string, maxAge: number, secure: boolean): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function assertBrowserRequest(request: Request): void {
  const site = request.headers.get("sec-fetch-site");
  if (!site || site === "same-origin" || site === "none") return;
  const dest = request.headers.get("sec-fetch-dest");
  const topLevelGet =
    request.headers.get("sec-fetch-mode") === "navigate" &&
    request.method === "GET" &&
    dest !== "object" &&
    dest !== "embed";
  if (topLevelGet) return;
  throw new NexoraError(403, "Forbidden");
}

function clientIp(request: Request): string {
  return (request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local").trim().slice(0, 64);
}

const buckets = new Map<string, { n: number; reset: number }>();

export function allow(ip: string, action: string, limit: number, windowMs: number): boolean {
  const key = `${action}:${ip}`;
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || now >= current.reset) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    return true;
  }
  if (current.n >= limit) return false;
  current.n += 1;
  return true;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function aesKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

function encrypt(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", aesKey(secret), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return new Date(0).toISOString();
}

function unavailable(reason: string): Metric {
  return { state: "unavailable", reason };
}

function metric(value: string, hint?: string): Metric {
  return hint ? { state: "value", value, hint } : { state: "value", value };
}

const StoredGuild = z.object({
  id: z.string().regex(SNOWFLAKE),
  name: z.string().max(100),
  icon: z.string().nullable(),
  owner: z.boolean(),
  permissions: z.string().max(40),
});

type StoredGuild = z.infer<typeof StoredGuild>;

type SessionRecord = {
  id: string;
  tokenHash: string;
  userId: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
  email: string | null;
  accessTokenEnc: string | null;
  refreshTokenEnc: string | null;
  tokenExpiresAt: string | null;
  guilds: StoredGuild[];
  csrfToken: string;
  expiresAt: string;
};

function parseGuilds(raw: string): StoredGuild[] {
  try {
    const parsed = z.array(StoredGuild).safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

async function db(): Promise<Sql> {
  return getSql();
}

export async function loadIntegration(request: Request | null): Promise<IntegrationStatus> {
  const env = discordEnv();
  const started = Date.now();
  let databaseOk = false;
  try {
    const sql = await db();
    await sql`select 1 as ok`;
    databaseOk = true;
  } catch (error) {
    console.error("[nexora] database check failed", redact(error instanceof Error ? error.message : "db"));
  }
  const missing = missingOauthPieces({
    clientId: env.clientId,
    clientSecret: env.clientSecret,
    sessionSecret: env.sessionSecret,
    botIdMismatch: env.botIdMismatch,
  });
  if (!env.botToken) missing.push("DISCORD_BOT_TOKEN");
  const runtimeProblem = env.runtimeUrl ? runtimeUrlError(env.runtimeUrl) : null;
  const sillydevReady = Boolean(env.sillydevKey && env.sillydevServer);
  if (!sillydevReady && (!env.runtimeUrl || !env.runtimeSecret || runtimeProblem)) missing.push("BOT_RUNTIME_URL");
  if (!env.ownerId) missing.push("DISCORD_OWNER_ID");
  if (!env.monitorSecret) missing.push("NEXORA_MONITOR_SECRET");
  return {
    database: {
      ok: databaseOk,
      latencyMs: databaseOk ? Date.now() - started : null,
      source: dbSource,
    },
    oauthConfigured: Boolean(env.clientId && env.clientSecret && env.sessionSecret && !env.botIdMismatch),
    sessionSecretConfigured: Boolean(env.sessionSecret),
    botTokenConfigured: Boolean(env.botToken),
    runtimeConfigured: sillydevReady || Boolean(env.runtimeUrl && env.runtimeSecret && !runtimeProblem),
    ownerConfigured: Boolean(env.ownerId),
    botIdMismatch: env.botIdMismatch,
    botId: NEXORA_BOT_ID,
    redirectUri: request ? callbackUrl(request) : env.redirectUri,
    missing: [...new Set(missing)],
    runtimeUrlError: runtimeProblem,
  };
}

async function readSession(token: string | null): Promise<SessionRecord | null> {
  if (!token || token.length < 20) return null;
  const sql = await db();
  const rows = await sql.query<{
    id: string;
    token_hash: string;
    discord_user_id: string;
    username: string;
    global_name: string | null;
    avatar: string | null;
    email: string | null;
    access_token_enc: string | null;
    refresh_token_enc: string | null;
    token_expires_at: unknown;
    guilds_json: string;
    csrf_token: string;
    expires_at: unknown;
  }>(
    `select id, token_hash, discord_user_id, username, global_name, avatar, email,
            access_token_enc, refresh_token_enc, token_expires_at, guilds_json,
            csrf_token, expires_at
     from nx_sessions where token_hash = $1`,
    [sha256(token)],
  );
  const row = rows[0];
  if (!row) return null;
  if (new Date(iso(row.expires_at)).getTime() <= Date.now()) {
    await sql.query("delete from nx_sessions where id = $1", [row.id]);
    return null;
  }
  return {
    id: row.id,
    tokenHash: row.token_hash,
    userId: row.discord_user_id,
    username: row.username,
    globalName: row.global_name,
    avatar: row.avatar,
    email: row.email,
    accessTokenEnc: row.access_token_enc,
    refreshTokenEnc: row.refresh_token_enc,
    tokenExpiresAt: row.token_expires_at ? iso(row.token_expires_at) : null,
    guilds: parseGuilds(row.guilds_json),
    csrfToken: row.csrf_token,
    expiresAt: iso(row.expires_at),
  };
}

async function requireSession(token: string | null): Promise<SessionRecord> {
  const session = await readSession(token);
  if (!session) throw new NexoraError(401, "Sign in with Discord to continue.");
  return session;
}

function isOwner(userId: string): boolean {
  const owner = discordEnv().ownerId;
  return Boolean(owner && owner === userId);
}

function guildsStale(session: SessionRecord): boolean {
  if (!session.tokenExpiresAt) return false;
  return new Date(session.tokenExpiresAt).getTime() <= Date.now();
}

export async function loadSessionView(token: string | null): Promise<SessionView> {
  const session = await readSession(token);
  if (!session) return { authenticated: false };
  return {
    authenticated: true,
    user: {
      id: session.userId,
      username: session.username,
      globalName: session.globalName,
      avatarUrl: discordAvatarUrl(session.userId, session.avatar),
      email: session.email,
    },
    csrfToken: session.csrfToken,
    expiresAt: session.expiresAt,
    isOwner: isOwner(session.userId),
    guildsStale: guildsStale(session),
  };
}

function assertCsrf(session: SessionRecord, csrf: string): void {
  if (!tokensMatch(session.csrfToken, csrf, true)) {
    throw new NexoraError(403, "The request could not be verified. Refresh the page and try again.");
  }
}

function managedGuild(session: SessionRecord, guildId: string): StoredGuild {
  if (!SNOWFLAKE.test(guildId)) throw new NexoraError(404, "That server was not found.");
  const guild = session.guilds.find((item) => item.id === guildId);
  if (!guild) throw new NexoraError(404, "That server is not available to this Discord account.");
  if (!canManageGuild(guild.owner, guild.permissions)) {
    throw new NexoraError(403, "You need Manage Server, Administrator, or ownership for that server.");
  }
  return guild;
}

function toSummary(guild: StoredGuild, present: "yes" | "no" | "unknown"): GuildSummary {
  return {
    id: guild.id,
    name: guild.name,
    iconUrl: guildIconUrl(guild.id, guild.icon),
    access: accessLevel(guild.owner, guild.permissions),
    canManage: canManageGuild(guild.owner, guild.permissions),
    botPresent: present,
  };
}

type CacheEntry<T> = { at: number; value: T };
const memory = new Map<string, CacheEntry<unknown>>();

async function remember<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = memory.get(key) as CacheEntry<T> | undefined;
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = await load();
  memory.set(key, { at: Date.now(), value });
  return value;
}

async function discordFetch(path: string, token: string, scheme: "Bot" | "Bearer"): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    return await fetch(`${API}${path}`, {
      headers: {
        Authorization: `${scheme} ${token}`,
        "User-Agent": "NexoraDashboard (https://nexoradash.sryze.cc, 1.0)",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

const DiscordUser = z.object({
  id: z.string(),
  username: z.string(),
  global_name: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  public_flags: z.number().optional(),
});

const DiscordApp = z.object({
  id: z.string(),
  name: z.string().optional(),
});

const DiscordGuild = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string().nullable().optional(),
  owner: z.boolean().optional(),
  permissions: z.union([z.string(), z.number()]).optional(),
  approximate_member_count: z.number().optional(),
  approximate_presence_count: z.number().optional(),
});

type BotIdentity = {
  id: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
  flags: number | null;
  applicationId: string | null;
  guildIds: string[];
  truncated: boolean;
  error: string | null;
};

async function fetchBotIdentity(): Promise<BotIdentity | null> {
  const token = discordEnv().botToken;
  if (!token) return null;
  return remember("bot-identity", 20_000, async () => {
    try {
      const userRes = await discordFetch("/users/@me", token, "Bot");
      if (userRes.status === 429) {
        return emptyIdentity("Discord rate-limited the bot identity request.");
      }
      if (!userRes.ok) {
        return emptyIdentity(
          userRes.status === 401
            ? "Discord rejected the bot token."
            : "Discord did not return the bot profile.",
        );
      }
      const user = DiscordUser.parse(await userRes.json());
      const gate = identityGate(user.id);
      if (gate.state === "mismatch") {
        return {
          ...emptyIdentity(
            `The bot token belongs to ${gate.actualId}, not Nexora Prime ${NEXORA_BOT_ID}.`,
          ),
          id: user.id,
          error: `The bot token belongs to ${gate.actualId}, not Nexora Prime ${NEXORA_BOT_ID}.`,
        };
      }
      let applicationId: string | null = null;
      const appRes = await discordFetch("/oauth2/applications/@me", token, "Bot");
      if (appRes.ok) {
        const app = DiscordApp.safeParse(await appRes.json());
        if (app.success) applicationId = app.data.id;
      }
      const guildIds: string[] = [];
      let after: string | null = null;
      let truncated = false;
      for (let page = 0; page < 5; page += 1) {
        const query = after ? `?limit=200&after=${after}` : "?limit=200";
        const guildRes = await discordFetch(`/users/@me/guilds${query}`, token, "Bot");
        if (!guildRes.ok) break;
        const guilds = z.array(DiscordGuild).parse(await guildRes.json());
        for (const guild of guilds) {
          if (SNOWFLAKE.test(guild.id)) guildIds.push(guild.id);
        }
        const last = guilds.at(-1);
        if (guilds.length < 200 || !last) break;
        after = last.id;
        if (page === 4) truncated = true;
      }
      return {
        id: user.id,
        username: user.username,
        globalName: user.global_name ?? null,
        avatar: user.avatar ?? null,
        flags: user.public_flags ?? null,
        applicationId,
        guildIds,
        truncated,
        error: null,
      };
    } catch (error) {
      console.error("[nexora] bot identity failed", redact(error instanceof Error ? error.message : "discord"));
      return emptyIdentity("The Discord API could not be reached.");
    }
  });
}

function emptyIdentity(error: string): BotIdentity {
  return {
    id: "",
    username: "",
    globalName: null,
    avatar: null,
    flags: null,
    applicationId: null,
    guildIds: [],
    truncated: false,
    error,
  };
}

async function totalUsersMetric(): Promise<Metric> {
  const token = discordEnv().botToken;
  if (!token) return unavailable("Total users need the bot token.");
  const identity = await fetchBotIdentity();
  if (!identity || identity.error || identity.id !== NEXORA_BOT_ID) {
    return unavailable("Total users stay hidden until the bot profile is confirmed.");
  }
  if (identity.guildIds.length === 0) {
    return metric("0", "This bot is not in any server.");
  }
  return remember("member-total-v3", 60_000, async () => {
    const ids = identity.guildIds.slice(0, 40);
    let users = 0;
    let counted = 0;
    for (let i = 0; i < ids.length; i += 5) {
      const counts = await Promise.all(
        ids.slice(i, i + 5).map(async (id) => {
          try {
            const res = await discordFetch(`/guilds/${id}?with_counts=true`, token, "Bot");
            if (!res.ok) return null;
            const body = DiscordGuild.safeParse(await res.json());
            return body.success ? (body.data.approximate_member_count ?? null) : null;
          } catch {
            return null;
          }
        }),
      );
      for (const count of counts) {
        if (count == null) continue;
        users += count;
        counted += 1;
      }
    }
    if (counted === 0) return unavailable("Discord did not return a member count for these servers.");
    const partial = identity.truncated || identity.guildIds.length > ids.length || counted < ids.length;
    return metric(
      String(users),
      partial
        ? `Approximate members across ${counted} of ${identity.guildIds.length} servers.`
        : `Approximate members across ${identity.guildIds.length} servers.`,
    );
  });
}

const RuntimeBody = z.object({
  bot_id: z.string(),
  online: z.boolean().optional(),
  uptime_seconds: z.number().nonnegative().optional(),
  latency_ms: z.number().nonnegative().optional(),
  guild_count: z.number().int().nonnegative().optional(),
  member_count: z.number().int().nonnegative().optional(),
});

type RuntimeSnap = {
  online: boolean | null;
  state: string | null;
  uptime: number | null;
  latency: number | null;
  guildCount: number | null;
  memberCount: number | null;
  error: string | null;
  source: "sillydev" | "bridge" | null;
};

const HOST_STATE: Record<string, string> = {
  running: "Running",
  starting: "Starting",
  stopping: "Stopping",
  offline: "Offline",
};

async function fetchSillyDev(): Promise<RuntimeSnap> {
  const env = discordEnv();
  const empty = (error: string): RuntimeSnap => ({
    online: null,
    state: null,
    uptime: null,
    latency: null,
    guildCount: null,
    memberCount: null,
    error,
    source: "sillydev",
  });
  if (!env.sillydevKey || !env.sillydevServer) return empty("SillyDev is not configured.");
  if (!/^[a-z0-9]{8}$/i.test(env.sillydevServer)) return empty("SillyDev server ID is not valid.");
  return remember("sillydev-runtime", 15_000, async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(
        `https://sillydev.co.uk/panel/api/client/servers/${env.sillydevServer}/resources`,
        {
          headers: { Authorization: `Bearer ${env.sillydevKey}`, Accept: "application/json" },
          signal: controller.signal,
        },
      );
      if (!response.ok) return empty("SillyDev did not return the server status.");
      const body = z
        .object({
          attributes: z.object({
            current_state: z.string(),
            resources: z.object({ uptime: z.number().nonnegative() }),
          }),
        })
        .safeParse(await response.json());
      if (!body.success) return empty("SillyDev status did not match the expected shape.");
      const state = body.data.attributes.current_state;
      return {
        online: state === "running",
        state,
        uptime: body.data.attributes.resources.uptime / 1000,
        latency: null,
        guildCount: null,
        memberCount: null,
        error: null,
        source: "sillydev",
      };
    } catch (error) {
      console.error("[nexora] sillydev unreachable", redact(error instanceof Error ? error.message : "sillydev"));
      return empty("SillyDev did not respond.");
    } finally {
      clearTimeout(timer);
    }
  });
}

async function fetchRuntime(): Promise<RuntimeSnap | null> {
  const env = discordEnv();
  if (env.sillydevKey && env.sillydevServer) return fetchSillyDev();
  if (!env.runtimeUrl || !env.runtimeSecret) return null;
  const problem = runtimeUrlError(env.runtimeUrl);
  if (problem) {
    return { online: null, state: null, uptime: null, latency: null, guildCount: null, memberCount: null, error: problem, source: "bridge" };
  }
  return remember("bot-runtime", 15_000, async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(env.runtimeUrl!, {
        headers: { Authorization: `Bearer ${env.runtimeSecret}`, Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) {
        return { online: null, state: null, uptime: null, latency: null, guildCount: null, memberCount: null, error: "The bot runtime endpoint returned an error.", source: "bridge" };
      }
      const body = RuntimeBody.safeParse(await response.json());
      if (!body.success) {
        return { online: null, state: null, uptime: null, latency: null, guildCount: null, memberCount: null, error: "The bot runtime response did not match the expected status shape.", source: "bridge" };
      }
      if (body.data.bot_id !== NEXORA_BOT_ID) {
        return {
          online: null,
          state: null,
          uptime: null,
          latency: null,
          guildCount: null,
          memberCount: null,
          error: `Runtime reported bot ${body.data.bot_id}, not ${NEXORA_BOT_ID}.`,
          source: "bridge",
        };
      }
      return {
        online: body.data.online ?? null,
        state: body.data.online == null ? null : body.data.online ? "running" : "offline",
        uptime: body.data.uptime_seconds ?? null,
        latency: body.data.latency_ms ?? null,
        guildCount: body.data.guild_count ?? null,
        memberCount: body.data.member_count ?? null,
        error: null,
        source: "bridge",
      };
    } catch (error) {
      console.error("[nexora] runtime unreachable", redact(error instanceof Error ? error.message : "runtime"));
      return { online: null, state: null, uptime: null, latency: null, guildCount: null, memberCount: null, error: "The bot runtime endpoint did not respond.", source: "bridge" };
    } finally {
      clearTimeout(timer);
    }
  });
}

export async function loadBotCard(): Promise<BotCard> {
  const env = discordEnv();
  const notes: string[] = [];
  let configurationError: string | null = null;
  if (env.botIdMismatch) {
    configurationError = `DISCORD_BOT_ID must stay ${NEXORA_BOT_ID}.`;
  }
  const createdAt = snowflakeDateIso(NEXORA_BOT_ID);
  const identity = configurationError ? null : await fetchBotIdentity();
  const runtime = configurationError ? null : await fetchRuntime();
  if (identity?.error) configurationError = identity.error;
  if (!configurationError && runtime?.error) notes.push(runtime.error);

  const matched = identity && !identity.error && identity.id === NEXORA_BOT_ID;
  const gateway: Metric = runtime?.state
    ? metric(HOST_STATE[runtime.state] ?? runtime.state, runtime.source === "sillydev" ? "SillyDev server process." : "Reported by the bot runtime.")
    : unavailable("Process status comes from the hosting panel or the bot runtime.");
  const uptime: Metric = runtime?.uptime == null
    ? unavailable("Uptime is reported by the hosting panel or the bot process.")
    : metric(formatDuration(runtime.uptime), runtime.source === "sillydev" ? "Server uptime from SillyDev." : "Reported by the bot runtime.");
  const latency = await gatewayLatencyMetric();

  let guildCount: Metric = unavailable("Server count needs the bot token or the bot runtime.");
  if (runtime?.guildCount != null) guildCount = metric(String(runtime.guildCount), "Reported by the bot runtime.");
  else if (matched) {
    guildCount = metric(
      identity!.truncated ? `${identity!.guildIds.length}+` : String(identity!.guildIds.length),
      identity!.truncated ? "Stopped at 1,000 servers to respect Discord rate limits." : "From the bot's guild list.",
    );
  }

  const memberCount: Metric = runtime?.memberCount == null
    ? unavailable("Discord does not give a reliable member total for the whole bot. It appears when the runtime reports one.")
    : metric(String(runtime.memberCount), "Reported by the bot runtime.");
  const userCount = await totalUsersMetric();

  if (!env.botToken) notes.push("Bot token is not configured, so the live profile cannot be loaded.");
  if (!env.runtimeUrl && !env.sillydevKey) {
    notes.push("Bot runtime is not linked, so presence and uptime stay unavailable.");
  }
  if (!matched && !configurationError) notes.push("Live profile has not been confirmed yet.");

  return {
    expectedBotId: NEXORA_BOT_ID,
    configurationError,
    name: matched ? identity!.globalName || identity!.username : null,
    username: matched ? identity!.username : null,
    avatarUrl: matched ? discordAvatarUrl(identity!.id, identity!.avatar) : null,
    applicationId: matched ? identity!.applicationId : null,
    createdAt,
    gateway,
    uptime,
    latency,
    guildCount,
    memberCount,
    userCount,
    verification: matched ? verificationFromFlags(identity!.flags) : "unavailable",
    inviteUrl: inviteUrl(env.clientId),
    restReachable: Boolean(matched),
    refreshedAt: new Date().toISOString(),
    notes,
  };
}

async function botIdSet(): Promise<{ known: boolean; ids: Set<string>; detail: string }> {
  const env = discordEnv();
  if (env.botIdMismatch) return { known: false, ids: new Set(), detail: "Bot ID configuration does not match Nexora Prime." };
  if (!env.botToken) return { known: false, ids: new Set(), detail: "Bot presence is unknown until DISCORD_BOT_TOKEN is set." };
  const identity = await fetchBotIdentity();
  if (!identity || identity.error || identity.id !== NEXORA_BOT_ID) {
    return { known: false, ids: new Set(), detail: identity?.error ?? "Bot presence is unavailable." };
  }
  return { known: true, ids: new Set(identity.guildIds), detail: "Presence is checked against the bot's current server list." };
}

export async function loadGuildList(token: string | null): Promise<GuildList> {
  const session = await requireSession(token);
  const presence = await botIdSet();
  const env = discordEnv();
  const guilds = session.guilds.map((guild) =>
    toSummary(guild, presence.known ? (presence.ids.has(guild.id) ? "yes" : "no") : "unknown"),
  );
  guilds.sort((a, b) => Number(b.canManage) - Number(a.canManage) || a.name.localeCompare(b.name));
  return {
    guilds,
    botPresence: presence.known ? "known" : "unknown",
    presenceDetail: presence.detail,
    guildsStale: guildsStale(session),
    inviteUrl: inviteUrl(env.clientId),
  };
}

async function countsFor(guildIds: string[]): Promise<{ pending: number; approved: number; rejected: number }> {
  if (guildIds.length === 0) return { pending: 0, approved: 0, rejected: 0 };
  const sql = await db();
  const params = guildIds;
  const placeholders = params.map((_, index) => `$${index + 1}`).join(", ");
  const rows = await sql.query<{ status: string; n: number }>(
    `select status, count(*)::int as n from nx_applications where guild_id in (${placeholders}) group by status`,
    params,
  );
  const counts = { pending: 0, approved: 0, rejected: 0 };
  for (const row of rows) {
    if (row.status === "pending" || row.status === "approved" || row.status === "rejected") {
      counts[row.status] = Number(row.n);
    }
  }
  return counts;
}

async function activityFor(
  guildIds: string[],
  includeSystem: boolean,
  limit: number,
  kind: string | null,
): Promise<ActivityItem[]> {
  const sql = await db();
  const params: unknown[] = [];
  const clauses: string[] = [];
  if (guildIds.length === 0 && !includeSystem) return [];
  if (guildIds.length > 0 && includeSystem) {
    const marks = guildIds.map((_, index) => `$${params.push(guildIds[index])}`).join(", ");
    clauses.push(`(guild_id in (${marks}) or guild_id is null)`);
  } else if (guildIds.length > 0) {
    const marks = guildIds.map((_, index) => `$${params.push(guildIds[index])}`).join(", ");
    clauses.push(`guild_id in (${marks})`);
  } else {
    clauses.push("guild_id is null");
  }
  if (kind) clauses.push(`kind = $${params.push(kind)}`);
  params.push(limit);
  const rows = await sql.query<{
    id: string;
    guild_id: string | null;
    level: string;
    kind: string;
    message: string;
    actor_id: string | null;
    created_at: unknown;
  }>(
    `select id, guild_id, level, kind, message, actor_id, created_at from (
       select id, guild_id, 'info' as level, 'audit' as kind, action || ': ' || detail as message, actor_id, created_at from nx_audit
       union all
       select id, guild_id, level, kind, message, null as actor_id, created_at from nx_bot_events
     ) events
     where ${clauses.join(" and ")}
     order by created_at desc
     limit $${params.length}`,
    params,
  );
  return rows.map((row) => ({
    id: row.id,
    at: iso(row.created_at),
    guildId: row.guild_id,
    kind: row.kind,
    level: row.level,
    message: redact(row.message),
    actorId: row.actor_id,
  }));
}

function manageableIds(session: SessionRecord): string[] {
  return session.guilds.filter((guild) => canManageGuild(guild.owner, guild.permissions)).map((guild) => guild.id);
}

export async function loadOverview(token: string | null, request: Request | null): Promise<Overview> {
  const session = await requireSession(token);
  const ids = manageableIds(session);
  const [bot, health, applications, recent, moderation] = await Promise.all([
    loadBotCard(),
    loadIntegration(request),
    countsFor(isOwner(session.userId) ? ids : ids),
    activityFor(ids, isOwner(session.userId), 8, null),
    activityFor(ids, false, 6, "moderation"),
  ]);
  if (isOwner(session.userId)) {
    const sql = await db();
    const all = await sql.query<{ status: string; n: number }>(
      "select status, count(*)::int as n from nx_applications group by status",
    );
    applications.pending = 0;
    applications.approved = 0;
    applications.rejected = 0;
    for (const row of all) {
      if (row.status === "pending" || row.status === "approved" || row.status === "rejected") {
        applications[row.status] = Number(row.n);
      }
    }
  }
  return { bot, health, applications, recent, moderation };
}

function storedConfig(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw || raw === "{}") return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && Object.keys(parsed).length > 0) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

async function settingsFor(guildId: string): Promise<GuildSettings> {
  const sql = await db();
  const rows = await sql.query<{ config_json: string; updated_by: string | null; updated_at: unknown }>(
    "select config_json, updated_by, updated_at from nx_guild_settings where guild_id = $1",
    [guildId],
  );
  const row = rows[0];
  const stored = row ? storedConfig(row.config_json) : null;
  const file = stored ? null : fileGuild(guildId);
  return toSettings(
    stored ?? file,
    {
      updatedAt: stored ? iso(row!.updated_at) : null,
      updatedBy: stored ? row!.updated_by : null,
      usingBotFile: !stored && Boolean(file),
    },
    guildId,
  );
}

export async function loadGuildDetail(token: string | null, guildId: string): Promise<GuildDetail> {
  const session = await requireSession(token);
  const guild = managedGuild(session, guildId);
  const presence = await botIdSet();
  const summary = toSummary(guild, presence.known ? (presence.ids.has(guild.id) ? "yes" : "no") : "unknown");
  const settings = await settingsFor(guildId);
  const moderation = await activityFor([guildId], false, 12, "moderation");
  const counts = await countsFor([guildId]);
  let liveName: string | null = null;
  let memberCount = unavailable("Member count is unavailable until the bot token can read this server.");
  let onlineCount = unavailable("Online count is unavailable until the bot token can read this server.");
  const env = discordEnv();
  if (summary.botPresent === "yes" && env.botToken) {
    try {
      const response = await discordFetch(`/guilds/${guildId}?with_counts=true`, env.botToken, "Bot");
      if (response.ok) {
        const body = DiscordGuild.parse(await response.json());
        liveName = body.name;
        if (typeof body.approximate_member_count === "number") {
          memberCount = metric(String(body.approximate_member_count), "Approximate, from Discord.");
        }
        if (typeof body.approximate_presence_count === "number") {
          onlineCount = metric(String(body.approximate_presence_count), "Approximate, from Discord.");
        }
      } else if (response.status === 404) {
        summary.botPresent = "no";
        memberCount = unavailable("Nexora Prime is not in this server.");
        onlineCount = unavailable("Nexora Prime is not in this server.");
      }
    } catch (error) {
      console.error("[nexora] guild lookup failed", redact(error instanceof Error ? error.message : "guild"));
    }
  } else if (summary.botPresent === "no") {
    memberCount = unavailable("Nexora Prime is not in this server.");
    onlineCount = unavailable("Nexora Prime is not in this server.");
  }
  return {
    guild: summary,
    settings,
    liveName,
    memberCount,
    onlineCount,
    moderation,
    applications: { pending: counts.pending, total: counts.pending + counts.approved + counts.rejected },
  };
}

const SettingsInput = z.object({
  csrf: z.string().min(16).max(200),
  theme: z.string().max(20),
  welcomeEnabled: z.boolean(),
  welcomeChannelId: z.string().max(20),
  welcomeMessage: z.string().max(2000),
  leaveEnabled: z.boolean(),
  leaveChannelId: z.string().max(20),
  leaveMessage: z.string().max(2000),
  joinRoleId: z.string().max(20),
  automod: z.boolean(),
  linkFilter: z.boolean(),
  bannedWords: z.string().max(2000),
  levelChannelId: z.string().max(20),
  ticketPanelStyle: z.string().max(20),
  ticketCategoryId: z.string().max(20),
  verificationEnabled: z.boolean(),
  verificationChannelId: z.string().max(20),
  verifiedRoleId: z.string().max(20),
  unverifiedRoleId: z.string().max(20),
  verificationMethod: z.string().max(20),
});

async function writeAudit(guildId: string | null, actorId: string, action: string, detail: string): Promise<void> {
  const sql = await db();
  await sql.query(
    "insert into nx_audit (id, guild_id, actor_id, action, detail) values ($1, $2, $3, $4, $5)",
    [randomUUID(), guildId, actorId, action, redact(detail).slice(0, 500)],
  );
}

export async function saveGuildSettings(token: string | null, guildId: string, input: unknown): Promise<MutationResult> {
  try {
    const session = await requireSession(token);
    const guild = managedGuild(session, guildId);
    const data = SettingsInput.parse(input);
    assertCsrf(session, data.csrf);
    for (const [label, value] of [
      ["Welcome channel", data.welcomeChannelId],
      ["Leave channel", data.leaveChannelId],
      ["Join role", data.joinRoleId],
      ["Level channel", data.levelChannelId],
      ["Ticket category", data.ticketCategoryId],
      ["Verification channel", data.verificationChannelId],
      ["Verified role", data.verifiedRoleId],
      ["Unverified role", data.unverifiedRoleId],
    ] as const) {
      if (!isSnowflake(value)) return { ok: false, error: `${label} must be a Discord snowflake or empty.` };
    }
    const sql = await db();
    const existing = await sql.query<{ config_json: string }>(
      "select config_json from nx_guild_settings where guild_id = $1",
      [guild.id],
    );
    const base = storedConfig(existing[0]?.config_json) ?? fileGuild(guild.id);
    const next = mergeConfig(base, data);
    await sql.query(
      `insert into nx_guild_settings
         (guild_id, moderator_role_id, config_json, updated_by, updated_at)
       values ($1, $2, $3, $4, now())
       on conflict (guild_id) do update set
         moderator_role_id = excluded.moderator_role_id,
         config_json = excluded.config_json,
         updated_by = excluded.updated_by,
         updated_at = now()`,
      [guild.id, data.joinRoleId.trim(), JSON.stringify(next), session.userId],
    );
    await writeAudit(guild.id, session.userId, "settings.save", "Saved Nexora Prime server settings.");
    return { ok: true };
  } catch (error) {
    if (error instanceof NexoraError) return { ok: false, error: error.message };
    if (error instanceof z.ZodError) return { ok: false, error: "Check the form and try again." };
    console.error("[nexora] save settings failed", redact(error instanceof Error ? error.message : "save"));
    return { ok: false, error: "Settings could not be saved." };
  }
}

export async function resetGuildSettings(token: string | null, guildId: string, csrf: string): Promise<MutationResult> {
  try {
    const session = await requireSession(token);
    const guild = managedGuild(session, guildId);
    assertCsrf(session, csrf);
    const sql = await db();
    await sql.query("delete from nx_guild_settings where guild_id = $1", [guild.id]);
    await writeAudit(guild.id, session.userId, "settings.reset", "Cleared saved settings. The uploaded bot file is shown again.");
    return { ok: true };
  } catch (error) {
    if (error instanceof NexoraError) return { ok: false, error: error.message };
    return { ok: false, error: "Settings could not be reset." };
  }
}

export async function loadBotForms(token: string | null): Promise<BotFormGroup[]> {
  const session = await requireSession(token);
  const allowed = new Set(isOwner(session.userId) ? knownApplyGuildIds() : manageableIds(session));
  return knownApplyGuildIds()
    .filter((id) => allowed.has(id))
    .map((id) => ({
      guildId: id,
      guildName: session.guilds.find((guild) => guild.id === id)?.name ?? null,
      forms: applyFormsFor(id),
    }))
    .filter((group) => group.forms.length > 0);
}

function parseAnswers(raw: string): Answer[] {
  const parsed = z.array(z.object({ question: z.string(), answer: z.string() })).safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : [];
}

export async function listApplications(token: string | null, guildId: string | null, status: string | null): Promise<ApplicationRow[]> {
  const session = await requireSession(token);
  const ids = manageableIds(session);
  const allowed = guildId ? ids.filter((id) => id === guildId) : ids;
  if (guildId && !ids.includes(guildId)) throw new NexoraError(404, "That server is not available to this account.");
  if (allowed.length === 0) return [];
  const sql = await db();
  const params: unknown[] = [...allowed];
  let where = `guild_id in (${allowed.map((_, index) => `$${index + 1}`).join(", ")})`;
  if (status === "pending" || status === "approved" || status === "rejected") {
    params.push(status);
    where += ` and status = $${params.length}`;
  }
  const rows = await sql.query<{
    id: string;
    guild_id: string;
    applicant_id: string;
    applicant_name: string;
    answers_json: string;
    status: "pending" | "approved" | "rejected";
    reviewer_id: string | null;
    reviewer_note: string;
    created_at: unknown;
    updated_at: unknown;
  }>(
    `select id, guild_id, applicant_id, applicant_name, answers_json, status, reviewer_id, reviewer_note, created_at, updated_at
     from nx_applications where ${where} order by created_at desc limit 100`,
    params,
  );
  const names = new Map(session.guilds.map((guild) => [guild.id, guild.name]));
  return rows.map((row) => ({
    id: row.id,
    guildId: row.guild_id,
    guildName: names.get(row.guild_id) ?? null,
    applicantId: row.applicant_id,
    applicantName: row.applicant_name,
    answers: (() => {
      try {
        return parseAnswers(row.answers_json);
      } catch {
        return [];
      }
    })(),
    status: row.status,
    reviewerId: row.reviewer_id,
    reviewerNote: row.reviewer_note,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    canReview: true,
  }));
}

const ReviewInput = z.object({
  csrf: z.string().min(16),
  status: z.enum(["approved", "rejected"]),
  note: z.string().max(500).optional(),
});

export async function reviewApplication(token: string | null, applicationId: string, input: unknown): Promise<MutationResult> {
  try {
    const session = await requireSession(token);
    const data = ReviewInput.parse(input);
    assertCsrf(session, data.csrf);
    if (!/^[0-9a-f-]{16,80}$/i.test(applicationId)) return { ok: false, error: "Unknown application." };
    const sql = await db();
    const rows = await sql.query<{ guild_id: string }>(
      "select guild_id from nx_applications where id = $1",
      [applicationId],
    );
    const row = rows[0];
    if (!row) return { ok: false, error: "That application no longer exists." };
    managedGuild(session, row.guild_id);
    const note = (data.note ?? "").trim();
    await sql.query(
      `update nx_applications
       set status = $2, reviewer_id = $3, reviewer_note = $4, updated_at = now()
       where id = $1`,
      [applicationId, data.status, session.userId, note],
    );
    await writeAudit(row.guild_id, session.userId, `application.${data.status}`, `Application ${applicationId}.`);
    return { ok: true };
  } catch (error) {
    if (error instanceof NexoraError) return { ok: false, error: error.message };
    if (error instanceof z.ZodError) return { ok: false, error: "Choose approve or reject." };
    return { ok: false, error: "The application could not be updated." };
  }
}

export async function loadLogs(
  token: string | null,
  input: { page?: number; level?: string; kind?: string; q?: string; guildId?: string },
): Promise<LogPage> {
  const session = await requireSession(token);
  const ids = manageableIds(session);
  const pageSize = 20;
  const page = Math.max(1, Math.min(500, Math.floor(input.page ?? 1)));
  if (input.guildId && !ids.includes(input.guildId) && !isOwner(session.userId)) {
    throw new NexoraError(404, "That server is not available to this account.");
  }
  const scope = input.guildId ? [input.guildId] : ids;
  if (input.guildId && !ids.includes(input.guildId)) {
    throw new NexoraError(403, "You cannot view logs for that server.");
  }
  const sql = await db();
  const params: unknown[] = [];
  const clauses: string[] = [];
  const includeSystem = isOwner(session.userId) && !input.guildId;
  if (scope.length === 0 && !includeSystem) return { items: [], page, pageSize, total: 0 };
  if (scope.length > 0 && includeSystem) {
    const marks = scope.map((id) => `$${params.push(id)}`).join(", ");
    clauses.push(`(guild_id in (${marks}) or guild_id is null)`);
  } else if (scope.length > 0) {
    const marks = scope.map((id) => `$${params.push(id)}`).join(", ");
    clauses.push(`guild_id in (${marks})`);
  } else {
    clauses.push("guild_id is null");
  }
  if (input.level === "info" || input.level === "warn" || input.level === "error") {
    clauses.push(`level = $${params.push(input.level)}`);
  }
  if (input.kind === "moderation" || input.kind === "application" || input.kind === "system" || input.kind === "audit") {
    clauses.push(`kind = $${params.push(input.kind)}`);
  }
  const q = safeSearch(input.q ?? "");
  if (q) clauses.push(`message ilike $${params.push(`%${q}%`)}`);
  const where = clauses.join(" and ");
  const totalRows = await sql.query<{ n: number }>(
    `select count(*)::int as n from (
       select id, guild_id, 'info' as level, 'audit' as kind, action || ': ' || detail as message, actor_id, created_at from nx_audit
       union all
       select id, guild_id, level, kind, message, null as actor_id, created_at from nx_bot_events
     ) events where ${where}`,
    params,
  );
  const limitIndex = params.push(pageSize);
  const offsetIndex = params.push((page - 1) * pageSize);
  const rows = await sql.query<{
    id: string;
    guild_id: string | null;
    level: string;
    kind: string;
    message: string;
    actor_id: string | null;
    created_at: unknown;
  }>(
    `select id, guild_id, level, kind, message, actor_id, created_at from (
       select id, guild_id, 'info' as level, 'audit' as kind, action || ': ' || detail as message, actor_id, created_at from nx_audit
       union all
       select id, guild_id, level, kind, message, null as actor_id, created_at from nx_bot_events
     ) events
     where ${where}
     order by created_at desc
     limit $${limitIndex} offset $${offsetIndex}`,
    params,
  );
  return {
    items: rows.map((row) => ({
      id: row.id,
      at: iso(row.created_at),
      guildId: row.guild_id,
      kind: row.kind,
      level: row.level,
      message: redact(row.message),
      actorId: row.actor_id,
    })),
    page,
    pageSize,
    total: Number(totalRows[0]?.n ?? 0),
  };
}

export async function loadOwner(token: string | null, request: Request | null): Promise<OwnerConsole> {
  const session = await requireSession(token);
  if (!discordEnv().ownerId) {
    throw new NexoraError(403, "Owner access is locked until DISCORD_OWNER_ID is set on the server.");
  }
  if (!isOwner(session.userId)) throw new NexoraError(403, "This console is limited to the configured bot owner.");
  const sql = await db();
  const [bot, health, recentErrors, sessionRows, applications] = await Promise.all([
    loadBotCard(),
    loadIntegration(request),
    activityFor([], true, 12, null).then((items) => items.filter((item) => item.level === "error")),
    sql.query<{ n: number }>("select count(*)::int as n from nx_sessions where expires_at > now()"),
    sql.query<{ status: string; n: number }>("select status, count(*)::int as n from nx_applications group by status"),
  ]);
  const counts = { pending: 0, approved: 0, rejected: 0 };
  for (const row of applications) {
    if (row.status === "pending" || row.status === "approved" || row.status === "rejected") counts[row.status] = Number(row.n);
  }
  const errors = recentErrors.length
    ? recentErrors
    : (await sql.query<{
        id: string;
        guild_id: string | null;
        level: string;
        kind: string;
        message: string;
        created_at: unknown;
      }>(
        `select id, guild_id, level, kind, message, created_at from nx_bot_events
         where level = 'error' order by created_at desc limit 12`,
      )).map((row) => ({
        id: row.id,
        at: iso(row.created_at),
        guildId: row.guild_id,
        kind: row.kind,
        level: row.level,
        message: redact(row.message),
        actorId: null,
      }));
  return {
    bot,
    health,
    applications: counts,
    recentErrors: errors,
    sessionCount: Number(sessionRows[0]?.n ?? 0),
  };
}

export async function destroySession(token: string | null, csrf: string): Promise<void> {
  const session = await requireSession(token);
  assertCsrf(session, csrf);
  const sql = await db();
  await sql.query("delete from nx_sessions where id = $1", [session.id]);
}

const IngestEvent = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("log"),
    level: z.enum(["info", "warn", "error"]),
    kind: z.enum(["moderation", "application", "system"]),
    guild_id: z.string().regex(SNOWFLAKE).nullable().optional(),
    message: z.string().min(1).max(2000),
  }),
  z.object({
    type: z.literal("application"),
    guild_id: z.string().regex(SNOWFLAKE),
    external_id: z.string().min(1).max(80),
    applicant_id: z.string().regex(SNOWFLAKE),
    applicant_name: z.string().min(1).max(80),
    answers: z.array(z.object({ question: z.string().max(300), answer: z.string().max(2000) })).max(30),
  }),
]);

const IngestBody = z.object({
  bot_id: z.string(),
  events: z.array(IngestEvent).min(1).max(40),
});

const OFFLINE_STATUS = new Set(["offline", "disconnected", "disconnect", "reconnecting", "connecting"]);

function reportedAt(value: string | number): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const LatencyBody = z.object({
  latency_ms: z.number().finite().nonnegative().max(60_000),
  bot_status: z.string().trim().min(1).max(32),
  timestamp: z.union([z.string().min(4).max(40), z.number().finite()]),
  bot_id: z.string(),
});

export async function recordGatewayLatency(authorization: string | null, raw: string): Promise<{ ok: true }> {
  const env = discordEnv();
  if (!env.monitorSecret) throw new NexoraError(503, "Gateway monitor is not configured.");
  const headerSecret = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : authorization?.trim() ?? "";
  if (!tokensMatch(env.monitorSecret, headerSecret, true)) throw new NexoraError(401, "Unauthorized");
  let body: z.infer<typeof LatencyBody>;
  try {
    body = LatencyBody.parse(JSON.parse(raw));
  } catch {
    throw new NexoraError(400, "Latency payload was rejected.");
  }
  if (body.bot_id !== NEXORA_BOT_ID) throw new NexoraError(409, "Latency bot id does not match Nexora Prime.");
  const reported = reportedAt(body.timestamp);
  if (!reported) throw new NexoraError(400, "Latency timestamp was rejected.");
  const sql = await db();
  await sql.query(
    `insert into nx_bot_latency (bot_id, latency_ms, bot_status, reported_at, received_at)
     values ($1, $2, $3, $4, now())
     on conflict (bot_id) do update set
       latency_ms = excluded.latency_ms,
       bot_status = excluded.bot_status,
       reported_at = excluded.reported_at,
       received_at = now()`,
    [NEXORA_BOT_ID, body.latency_ms, body.bot_status.toLowerCase(), reported],
  );
  return { ok: true };
}

async function gatewayLatencyMetric(): Promise<Metric> {
  try {
    const sql = await db();
    const rows = await sql.query<{ latency_ms: number | string; bot_status: string; received_at: unknown }>(
      "select latency_ms, bot_status, received_at from nx_bot_latency where bot_id = $1",
      [NEXORA_BOT_ID],
    );
    const row = rows[0];
    if (!row) return unavailable("The bot has not reported Discord gateway latency.");
    const received = new Date(iso(row.received_at)).getTime();
    if (!Number.isFinite(received) || Date.now() - received > 30_000) {
      return unavailable("No gateway report in the last 30 seconds.");
    }
    if (OFFLINE_STATUS.has(row.bot_status)) {
      return metric("Offline", "The bot reported it is disconnected.");
    }
    const ms = Number(row.latency_ms);
    if (!Number.isFinite(ms)) return unavailable("The stored gateway latency was not a number.");
    return metric(gatewayLatencyLabel(ms), `${Math.round(ms)} ms · Discord gateway`);
  } catch (error) {
    console.error("[nexora] latency read failed", redact(error instanceof Error ? error.message : "latency"));
    return unavailable("Gateway latency could not be read.");
  }
}

export async function ingest(authorization: string | null, raw: string): Promise<{ accepted: number }> {
  const env = discordEnv();
  if (!env.runtimeSecret) throw new NexoraError(503, "The bot bridge secret is not configured.");
  const presented = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!tokensMatch(env.runtimeSecret, presented, true)) throw new NexoraError(401, "Unauthorized");
  let body: z.infer<typeof IngestBody>;
  try {
    body = IngestBody.parse(JSON.parse(raw));
  } catch {
    throw new NexoraError(400, "The bridge payload was rejected.");
  }
  if (body.bot_id !== NEXORA_BOT_ID) {
    throw new NexoraError(409, "Bridge bot id does not match Nexora Prime.");
  }
  const sql = await db();
  let accepted = 0;
  for (const event of body.events) {
    if (event.type === "log") {
      await sql.query(
        "insert into nx_bot_events (id, guild_id, level, kind, message) values ($1, $2, $3, $4, $5)",
        [randomUUID(), event.guild_id ?? null, event.level, event.kind, redact(event.message)],
      );
      accepted += 1;
    } else {
      await sql.query(
        `insert into nx_applications
           (id, guild_id, external_id, applicant_id, applicant_name, answers_json, status)
         values ($1, $2, $3, $4, $5, $6, 'pending')
         on conflict (guild_id, external_id) do update set
           applicant_name = excluded.applicant_name,
           answers_json = excluded.answers_json,
           updated_at = now()
         where nx_applications.status = 'pending'`,
        [
          randomUUID(),
          event.guild_id,
          event.external_id,
          event.applicant_id,
          event.applicant_name,
          JSON.stringify(event.answers),
        ],
      );
      accepted += 1;
    }
  }
  return { accepted };
}

export async function bridgeSettings(authorization: string | null, guildId: string): Promise<GuildSettings> {
  const env = discordEnv();
  if (!env.runtimeSecret) throw new NexoraError(503, "The bot bridge secret is not configured.");
  const presented = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!tokensMatch(env.runtimeSecret, presented, true)) throw new NexoraError(401, "Unauthorized");
  if (!SNOWFLAKE.test(guildId)) throw new NexoraError(404, "Unknown server.");
  return settingsFor(guildId);
}

const TokenResponse = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().positive(),
});

async function exchangeCode(code: string, redirectUri: string): Promise<z.infer<typeof TokenResponse>> {
  const env = discordEnv();
  if (!env.clientId || !env.clientSecret) throw new NexoraError(500, "oauth_not_configured");
  const response = await fetch(`${API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.clientId,
      client_secret: env.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!response.ok) throw new NexoraError(400, mapTokenStatus(response.status));
  const parsed = TokenResponse.safeParse(await response.json());
  if (!parsed.success) throw new NexoraError(502, "discord_down");
  return parsed.data;
}

async function pullIdentity(accessToken: string): Promise<{ user: z.infer<typeof DiscordUser>; guilds: StoredGuild[] }> {
  const userRes = await discordFetch("/users/@me", accessToken, "Bearer");
  if (!userRes.ok) throw new NexoraError(502, userRes.status === 401 ? "invalid_code" : "discord_down");
  const user = DiscordUser.safeParse(await userRes.json());
  if (!user.success || !SNOWFLAKE.test(user.data.id)) throw new NexoraError(502, "discord_down");
  const guilds: StoredGuild[] = [];
  let after: string | null = null;
  for (let page = 0; page < 5; page += 1) {
    const query = after ? `?limit=200&after=${after}` : "?limit=200";
    const guildRes = await discordFetch(`/users/@me/guilds${query}`, accessToken, "Bearer");
    if (!guildRes.ok) throw new NexoraError(502, "discord_down");
    const list = z.array(DiscordGuild).parse(await guildRes.json());
    for (const guild of list) {
      const stored = StoredGuild.safeParse({
        id: guild.id,
        name: guild.name.slice(0, 100),
        icon: guild.icon ?? null,
        owner: Boolean(guild.owner),
        permissions: String(guild.permissions ?? "0"),
      });
      if (stored.success) guilds.push(stored.data);
    }
    const last = list.at(-1);
    if (list.length < 200 || !last) break;
    after = last.id;
  }
  return { user: user.data, guilds };
}

export async function beginLogin(request: Request): Promise<Response> {
  assertBrowserRequest(request);
  if (!allow(clientIp(request), "login", 20, 10 * 60_000)) {
    return loginRedirect(request, "rate_limited");
  }
  const env = discordEnv();
  if (env.botIdMismatch) return loginRedirect(request, "bot_id_mismatch");
  if (!env.clientId || !env.clientSecret || !env.sessionSecret) return loginRedirect(request, "oauth_not_configured");
  const state = randomBytes(24).toString("hex");
  const sql = await db();
  await sql.query("delete from nx_oauth_states where expires_at < now()");
  await sql.query("insert into nx_oauth_states (state_hash, expires_at) values ($1, now() + interval '10 minutes')", [
    sha256(state),
  ]);
  const redirectUri = callbackUrl(request);
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", env.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "identify guilds email guilds.members.read");
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("prompt", "consent");
  const headers = new Headers();
  headers.set("Location", url.toString());
  headers.set("Cache-Control", "no-store");
  headers.append("Set-Cookie", cookieHeader("nx_oauth_state", state, STATE_SECONDS, requestIsSecure(request)));
  return new Response(null, { status: 302, headers });
}

function appLocation(request: Request, path: string): string {
  if (request.headers.get("x-forwarded-host")) return `${originOf(request)}${path}`;
  return path;
}

function loginRedirect(request: Request, code: string): Response {
  const headers = new Headers();
  headers.set("Location", appLocation(request, `/login?error=${code}`));
  headers.set("Cache-Control", "no-store");
  headers.append("Set-Cookie", cookieHeader("nx_oauth_state", "", 0, requestIsSecure(request)));
  return new Response(null, { status: 302, headers });
}

export async function finishLogin(request: Request): Promise<Response> {
  assertBrowserRequest(request);
  const url = new URL(request.url);
  const oauthError = url.searchParams.get("error");
  if (oauthError === "access_denied") return loginRedirect(request, "access_denied");
  if (oauthError) return loginRedirect(request, "oauth_denied");
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const cookie = readCookie(request, "nx_oauth_state") ?? undefined;
  const env = discordEnv();
  if (!env.sessionSecret || !state || !code || !tokensMatch(cookie, state, true)) {
    return loginRedirect(request, "invalid_state");
  }
  const sql = await db();
  const known = await sql.query<{ expires_at: unknown }>(
    "delete from nx_oauth_states where state_hash = $1 returning expires_at",
    [sha256(state)],
  );
  if (!known[0] || new Date(iso(known[0].expires_at)).getTime() <= Date.now()) {
    return loginRedirect(request, "invalid_state");
  }
  try {
    const redirectUri = callbackUrl(request);
    const tokens = await exchangeCode(code, redirectUri);
    const identity = await pullIdentity(tokens.access_token);
    const sessionToken = randomBytes(32).toString("base64url");
    const csrf = randomBytes(24).toString("hex");
    const secret = env.sessionSecret;
    const tokenExpires = new Date(
      Date.now() + Math.max(30, Math.floor(tokens.expires_in) - 30) * 1000,
    ).toISOString();
    const sessionExpires = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
    await sql.query(
      `insert into nx_sessions
         (id, token_hash, discord_user_id, username, global_name, avatar, email, access_token_enc,
          refresh_token_enc, token_expires_at, guilds_json, csrf_token, expires_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        randomUUID(),
        sha256(sessionToken),
        identity.user.id,
        identity.user.username.slice(0, 32),
        identity.user.global_name ?? null,
        identity.user.avatar ?? null,
        identity.user.email ?? null,
        encrypt(tokens.access_token, secret),
        tokens.refresh_token ? encrypt(tokens.refresh_token, secret) : null,
        tokenExpires,
        JSON.stringify(identity.guilds),
        csrf,
        sessionExpires,
      ],
    );
    const headers = new Headers();
    headers.set("Location", appLocation(request, "/"));
    headers.set("Cache-Control", "no-store");
    headers.append("Set-Cookie", cookieHeader("nx_oauth_state", "", 0, requestIsSecure(request)));
    headers.append("Set-Cookie", cookieHeader("nx_session", sessionToken, SESSION_SECONDS, requestIsSecure(request)));
    return new Response(null, { status: 302, headers });
  } catch (error) {
    const codeName = error instanceof NexoraError ? error.message : "discord_down";
    const safe = ["invalid_code", "discord_down", "oauth_not_configured"].includes(codeName)
      ? codeName
      : "discord_down";
    console.error("[nexora] oauth callback failed", redact(error instanceof Error ? error.message : "oauth"));
    return loginRedirect(request, safe);
  }
}

export async function logoutResponse(request: Request): Promise<Response> {
  assertBrowserRequest(request);
  let body = "";
  try {
    body = await request.text();
  } catch {
    body = "";
  }
  const csrf = request.headers.get("x-nx-csrf") || new URLSearchParams(body).get("csrf") || "";
  try {
    await destroySession(readCookie(request, "nx_session"), csrf);
  } catch (error) {
    if (error instanceof NexoraError) {
      return Response.json({ ok: false, error: error.message }, { status: error.status });
    }
    return Response.json({ ok: false, error: "Logout failed." }, { status: 500 });
  }
  const headers = new Headers();
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.append("Set-Cookie", cookieHeader("nx_session", "", 0, requestIsSecure(request)));
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}
