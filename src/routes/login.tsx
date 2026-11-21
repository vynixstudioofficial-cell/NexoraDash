import { createFileRoute, isRedirect, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getIntegrationStatus, getPublicBot, getSessionView } from "@/lib/nexora/fns";
import { previewPathPrefix } from "@/lib/preview-path-prefix";
import { NEXORA_BOT_ID } from "@/lib/nexora/pure";
import { Badge, Mark, MetricBlock, Panel, StatusDot } from "@/components/nexora/ui";
import type { BotCard } from "@/lib/nexora/types";

const ERRORS: Record<string, string> = {
  access_denied: "Discord authorization was cancelled. No session was created.",
  oauth_denied: "Discord did not complete authorization. No session was created.",
  invalid_state: "This login attempt expired or did not match this browser. Start again.",
  oauth_not_configured:
    "Discord OAuth is not configured. Set DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, and SESSION_SECRET on the server. Nothing was signed in.",
  invalid_code: "Discord rejected the authorization code. It may have expired. Try again.",
  discord_down: "Discord’s API did not respond. No session was created.",
  bot_id_mismatch: `DISCORD_BOT_ID does not match Nexora Dashboard ${NEXORA_BOT_ID}.`,
  rate_limited: "Too many login attempts. Wait a few minutes and try again.",
};

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { error?: string } => ({
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  beforeLoad: async () => {
    try {
      const me = await getSessionView();
      if (me.authenticated) throw redirect({ to: "/" });
    } catch (error) {
      if (isRedirect(error)) throw error;
    }
  },
  loader: async () => {
    try {
      const [status, bot] = await Promise.all([
        getIntegrationStatus(),
        getPublicBot(),
      ]);
      return { status, bot };
    } catch (error) {
      console.error("[nexora] login data failed", error instanceof Error ? error.message : "login");
      return { status: null, bot: null };
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const loaded = Route.useLoaderData();
  const { error } = Route.useSearch();
  const [bot, setBot] = useState<BotCard | null>(loaded.bot);
  const [status, setStatus] = useState(loaded.status);
  const [botState, setBotState] = useState<"ready" | "loading" | "failed">(loaded.bot ? "ready" : "loading");
  const message = error ? (ERRORS[error] ?? "Sign-in did not complete. No session was created.") : null;

  useEffect(() => {
    let live = true;
    void getPublicBot()
      .then((card) => {
        if (!live) return;
        setBot(card);
        setBotState("ready");
      })
      .catch(() => {
        if (!live || loaded.bot) return;
        setBotState("failed");
      });
    if (!loaded.status) {
      void getIntegrationStatus()
        .then((next) => {
          if (live) setStatus(next);
        })
        .catch(() => undefined);
    }
    return () => {
      live = false;
    };
  }, [loaded.bot, loaded.status]);

  return (
    <main className="mx-auto grid min-h-dvh w-full min-w-0 max-w-6xl items-center gap-8 overflow-x-clip px-4 py-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:px-8">
      <section className="min-w-0">
        <div className="flex items-center gap-3">
          <Mark className="size-11" />
          <p className="font-display text-sm tracking-widest text-muted">NEXORA DASHBOARD</p>
        </div>
        <h1 className="mt-6 max-w-xl text-4xl font-medium leading-tight md:text-5xl">
          Control panel for Nexora.
        </h1>
        <p className="mt-4 max-w-xl text-muted">
          Sign in with Discord to manage the Nexora servers you own or moderate.
        </p>
        <div className="mt-8 max-w-md">
          <a
            href="/auth/discord/login"
            className="nx-press inline-flex min-h-11 w-full items-center justify-center rounded-sm bg-accent px-4 text-sm font-medium text-accent-fg nx-glow hover:brightness-110"
            onClick={(event) => {
              const prefix = previewPathPrefix(window.location.hostname, window.location.pathname) ?? "";
              if (!prefix) return;
              event.preventDefault();
              window.location.assign(`${prefix}/auth/discord/login`);
            }}
          >
            Continue with Discord
          </a>
          {message ? (
            <p role="alert" className="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-3 text-sm text-fg">
              {message}
            </p>
          ) : null}
          <p className="mt-3 text-xs text-faint">
            Authorization uses Discord’s official login. This page never asks for your password or bot token.
          </p>
        </div>
      </section>
      {bot && status ? (
        <LiveBot bot={bot} status={status} />
      ) : botState === "failed" ? (
        <Panel title="Live bot">
          <p className="text-sm text-muted">Live status could not be loaded. You can still sign in.</p>
        </Panel>
      ) : (
        <Panel title="Live bot">
          <p className="text-sm text-muted">Loading live status…</p>
        </Panel>
      )}
    </main>
  );
}

function LiveBot({ bot, status }: { bot: BotCard; status: { database: { ok: boolean; latencyMs: number | null }; oauthConfigured: boolean; botTokenConfigured: boolean; runtimeConfigured: boolean; runtimeUrlError: string | null; ownerConfigured: boolean; missing: string[] } }) {
  return (
    <Panel title="Live bot">
      <div className="mb-4 flex items-center gap-3">
        {bot.avatarUrl ? (
          <img src={bot.avatarUrl} alt="" className="size-12 rounded-lg border border-line" />
        ) : (
          <div className="grid size-12 place-items-center rounded-lg border border-dashed border-line text-xs text-faint">
            None
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate font-medium">{bot.name ?? "Name unavailable"}</p>
          <p className="truncate text-sm text-muted">{bot.username ? `@${bot.username}` : "Username unavailable"}</p>
          <StatusDot state={gatewayOf(bot)} />
        </div>
      </div>
      {bot.configurationError ? (
        <p role="alert" className="mb-4 text-sm text-danger">{bot.configurationError}</p>
      ) : null}
      <div className="mb-5 grid grid-cols-2 gap-4">
        <MetricBlock label="Servers" metric={bot.guildCount} />
        <MetricBlock label="Total users" metric={bot.userCount} />
        <MetricBlock label="Latency" metric={bot.latency} />
      </div>
      <ul className="space-y-3 text-sm">
        <Health label="Database" ok={status.database.ok} detail={status.database.ok ? `${status.database.latencyMs ?? 0} ms` : "Unavailable"} />
        <Health label="Discord OAuth" ok={status.oauthConfigured} detail={status.oauthConfigured ? "Ready" : "Missing secrets"} />
        <Health label="Bot token" ok={status.botTokenConfigured} detail={status.botTokenConfigured ? "Set" : "Not set"} />
        <Health label="Bot runtime" ok={status.runtimeConfigured} detail={status.runtimeUrlError ?? (status.runtimeConfigured ? "Linked" : "Not linked")} />
        <Health label="Owner lock" ok={status.ownerConfigured} detail={status.ownerConfigured ? "Configured" : "Not set"} />
      </ul>
      {status.missing.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {status.missing.map((name) => (
            <Badge key={name} tone="warn">
              {name}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-ok">Required server configuration is present.</p>
      )}
    </Panel>
  );
}

function gatewayOf(bot: BotCard): "online" | "offline" | "unknown" {
  if (bot.gateway.state !== "value") return "unknown";
  if (bot.gateway.value === "Running" || bot.gateway.value === "Starting" || bot.gateway.value === "Online") return "online";
  if (bot.gateway.value === "Offline" || bot.gateway.value === "Stopping") return "offline";
  return "unknown";
}

function Health({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-line pb-3 last:border-0">
      <span>{label}</span>
      <span className={ok ? "text-ok" : "text-faint"}>{detail}</span>
    </li>
  );
}
