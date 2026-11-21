import assert from "node:assert/strict";
import test from "node:test";
import {
  NEXORA_BOT_ID,
  accessLevel,
  canManageGuild,
  discordAvatarUrl,
  formatDuration,
  gatewayLatencyLabel,
  identityGate,
  inviteUrl,
  mapTokenStatus,
  missingOauthPieces,
  rateLimit,
  redact,
  runtimeUrlError,
  safeSearch,
  snowflakeDateIso,
  tokensMatch,
  verificationFromFlags,
} from "./pure.ts";

test("gateway latency bands", () => {
  assert.equal(gatewayLatencyLabel(0), "Excellent");
  assert.equal(gatewayLatencyLabel(99.9), "Excellent");
  assert.equal(gatewayLatencyLabel(100), "Good");
  assert.equal(gatewayLatencyLabel(200), "Good");
  assert.equal(gatewayLatencyLabel(201), "Moderate");
  assert.equal(gatewayLatencyLabel(350), "Moderate");
  assert.equal(gatewayLatencyLabel(351), "High");
});

test("confirmed bot snowflake date is stable", () => {
  assert.equal(snowflakeDateIso(NEXORA_BOT_ID), "2026-07-13T04:17:56.897Z");
  assert.equal(snowflakeDateIso("nope"), null);
});

test("manage access requires owner, administrator, or manage server", () => {
  assert.equal(accessLevel(true, "0"), "owner");
  assert.equal(canManageGuild(true, "0"), true);
  assert.equal(accessLevel(false, "8"), "administrator");
  assert.equal(accessLevel(false, "32"), "manage");
  assert.equal(accessLevel(false, "2048"), "member");
  assert.equal(canManageGuild(false, "2048"), false);
  assert.equal(canManageGuild(false, "not-a-number"), false);
});

test("bot identity mismatch does not count as Nexora Prime", () => {
  assert.deepEqual(identityGate(null), { state: "unavailable" });
  assert.deepEqual(identityGate(NEXORA_BOT_ID), { state: "match" });
  assert.deepEqual(identityGate("123456789012345678"), {
    state: "mismatch",
    actualId: "123456789012345678",
  });
});

test("verification is shown only from Discord's verified-bot flag", () => {
  assert.equal(verificationFromFlags(undefined), "not_confirmed");
  assert.equal(verificationFromFlags(1), "not_confirmed");
  assert.equal(verificationFromFlags(1 << 16), "verified");
});

test("default avatars are used when Discord sends no avatar hash", () => {
  const url = discordAvatarUrl(NEXORA_BOT_ID, null);
  assert.match(url, /^https:\/\/cdn\.discordapp\.com\/embed\/avatars\/[0-5]\.png$/);
  assert.match(discordAvatarUrl(NEXORA_BOT_ID, "abc"), /\/avatars\/.+\/abc\.png/);
  assert.match(discordAvatarUrl(NEXORA_BOT_ID, "a_abc"), /\/a_abc\.gif/);
});

test("invite link is omitted until a real application id is configured", () => {
  assert.equal(inviteUrl(null), null);
  assert.equal(inviteUrl("not-an-id"), null);
  const url = inviteUrl(NEXORA_BOT_ID);
  assert.ok(url?.startsWith("https://discord.com/oauth2/authorize?"));
  assert.match(url ?? "", new RegExp(`client_id=${NEXORA_BOT_ID}`));
});

test("secrets are redacted before logs", () => {
  const raw =
    "Authorization: Bearer abcdefghijklmnopqrstuvwxyz client_secret=supersecretvalue DISCORD_BOT_TOKEN=anothersecretvalue";
  const clean = redact(raw);
  assert.equal(clean.includes("supersecretvalue"), false);
  assert.equal(clean.includes("anothersecretvalue"), false);
  assert.match(clean, /Bearer \[redacted\]/);
});

test("oauth state and token failures fail closed", () => {
  assert.equal(tokensMatch("abc", "abc", true), true);
  assert.equal(tokensMatch("abc", "abd", true), false);
  assert.equal(tokensMatch("abc", "abcd", true), false);
  assert.equal(tokensMatch(undefined, "abc", false), false);
  assert.equal(mapTokenStatus(400), "invalid_code");
  assert.equal(mapTokenStatus(401), "invalid_code");
  assert.equal(mapTokenStatus(500), "discord_down");
  assert.equal(mapTokenStatus(429), "discord_down");
});

test("oauth stays unconfigured until every required secret exists", () => {
  assert.deepEqual(
    missingOauthPieces({
      clientId: null,
      clientSecret: "secret",
      sessionSecret: null,
      botIdMismatch: true,
    }),
    ["DISCORD_BOT_ID", "DISCORD_CLIENT_ID", "SESSION_SECRET"],
  );
  assert.deepEqual(
    missingOauthPieces({
      clientId: "1",
      clientSecret: "2",
      sessionSecret: "3",
      botIdMismatch: false,
    }),
    [],
  );
});

test("runtime URL cannot point at metadata or public http hosts", () => {
  assert.equal(runtimeUrlError("https://bot.example.com/status"), null);
  assert.equal(runtimeUrlError("http://127.0.0.1:8787/status"), null);
  assert.equal(runtimeUrlError("http://10.0.0.8/status"), null);
  assert.ok(runtimeUrlError("http://example.com/status"));
  assert.ok(runtimeUrlError("http://169.254.169.254/latest"));
  assert.ok(runtimeUrlError("https://user:pass@bot.example.com/status"));
  assert.ok(runtimeUrlError("not a url"));
});

test("search and rate limit helpers", () => {
  assert.equal(safeSearch("100%_drop\\"), "100drop");
  const first = rateLimit(undefined, 1_000, 2, 5_000);
  assert.equal(first.ok, true);
  const second = rateLimit(first.next, 1_100, 2, 5_000);
  assert.equal(second.ok, true);
  const blocked = rateLimit(second.next, 1_200, 2, 5_000);
  assert.equal(blocked.ok, false);
  assert.equal(formatDuration(90), "1m 30s");
  assert.equal(formatDuration(3700), "1h 1m");
});
