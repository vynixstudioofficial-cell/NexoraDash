import { SESSION_COOKIE, redact } from "./pure";
import {
  NexoraError,
  assertBrowserRequest,
  bridgeSettings,
  ingest,
  loadBotCard,
  loadGuildDetail,
  loadGuildList,
  loadIntegration,
  loadLogs,
  loadOverview,
  loadOwner,
  loadSessionView,
  listApplications,
  logoutResponse,
  readCookie,
  recordGatewayLatency,
  resetGuildSettings,
  reviewApplication,
  saveGuildSettings,
} from "./service.server";

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

function fail(error: unknown): Response {
  if (error instanceof NexoraError) return json({ ok: false, error: error.message }, error.status);
  console.error("[nexora] api failed", redact(error instanceof Error ? error.message : "api"));
  return json({ ok: false, error: "Request failed." }, 500);
}

export async function dispatchApi(request: Request, splat: string): Promise<Response> {
  const path = splat.replace(/^\/+|\/+$/g, "");
  const url = new URL(request.url);
  try {
    assertBrowserRequest(request);
    if (path === "internal/ingest" && request.method === "POST") {
      const raw = await request.text();
      if (raw.length > 100_000) return json({ ok: false, error: "Payload is too large." }, 413);
      return json(await ingest(request.headers.get("authorization"), raw));
    }
    if (path.startsWith("internal/settings/") && request.method === "GET") {
      return json(await bridgeSettings(request.headers.get("authorization"), path.slice("internal/settings/".length)));
    }
    if (path === "integration/status" && request.method === "GET") {
      return json(await loadIntegration(request));
    }
    if (path === "bot/latency" && request.method === "POST") {
      const raw = await request.text();
      if (raw.length > 4_000) return json({ ok: false, error: "Payload is too large." }, 413);
      const secret = request.headers.get("authorization") || request.headers.get("x-nexora-monitor-secret");
      return json(await recordGatewayLatency(secret, raw));
    }

    const token = readCookie(request, SESSION_COOKIE);
    if (path === "auth/me" && request.method === "GET") return json(await loadSessionView(token));
    if (path === "auth/guilds" && request.method === "GET") return json(await loadGuildList(token));
    if (path === "bot/info" && request.method === "GET") {
      await loadSessionView(token).then((view) => {
        if (!view.authenticated) throw new NexoraError(401, "Sign in with Discord to continue.");
      });
      return json(await loadBotCard());
    }
    if (path === "bot/stats" && request.method === "GET") {
      const view = await loadSessionView(token);
      if (!view.authenticated) throw new NexoraError(401, "Sign in with Discord to continue.");
      const card = await loadBotCard();
      return json({
        gateway: card.gateway,
        uptime: card.uptime,
        latency: card.latency,
        guildCount: card.guildCount,
        memberCount: card.memberCount,
        userCount: card.userCount,
        refreshedAt: card.refreshedAt,
        configurationError: card.configurationError,
      });
    }
    if (path === "dashboard/overview" && request.method === "GET") return json(await loadOverview(token, request));
    if (path === "applications" && request.method === "GET") {
      return json(
        await listApplications(token, url.searchParams.get("guild_id"), url.searchParams.get("status")),
      );
    }
    if (path === "logs" && request.method === "GET") {
      return json(
        await loadLogs(token, {
          page: Number(url.searchParams.get("page") ?? "1"),
          level: url.searchParams.get("level") ?? undefined,
          kind: url.searchParams.get("kind") ?? undefined,
          q: url.searchParams.get("q") ?? undefined,
          guildId: url.searchParams.get("guild_id") ?? undefined,
        }),
      );
    }
    if (path === "owner/console" && request.method === "GET") return json(await loadOwner(token, request));

    const server = /^servers\/(\d{17,20})$/.exec(path);
    if (server && request.method === "GET") return json(await loadGuildDetail(token, server[1]!));
    const settings = /^servers\/(\d{17,20})\/settings$/.exec(path);
    if (settings && request.method === "PUT") {
      return json(await saveGuildSettings(token, settings[1]!, await request.json()));
    }
    const reset = /^servers\/(\d{17,20})\/reset$/.exec(path);
    if (reset && request.method === "POST") {
      const body = (await request.json()) as { csrf?: string };
      return json(await resetGuildSettings(token, reset[1]!, body.csrf ?? ""));
    }
    const review = /^applications\/([0-9a-f-]{16,80})\/review$/i.exec(path);
    if (review && request.method === "POST") {
      return json(await reviewApplication(token, review[1]!, await request.json()));
    }
    return json({ ok: false, error: "Not found." }, 404);
  } catch (error) {
    return fail(error);
  }
}

export async function dispatchLogout(request: Request): Promise<Response> {
  try {
    return await logoutResponse(request);
  } catch (error) {
    return fail(error);
  }
}
