import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { getOverview } from "@/lib/nexora/fns";
import type { BotCard, Overview } from "@/lib/nexora/types";
import { Badge, Button, CopyButton, Empty, MetricBlock, Panel, Skeleton, StatusDot, when } from "@/components/nexora/ui";

export const Route = createFileRoute("/_app/")({
  component: OverviewPage,
});

function gatewayState(bot: BotCard): "online" | "offline" | "unknown" {
  if (bot.gateway.state !== "value") return "unknown";
  if (bot.gateway.value === "Online") return "online";
  if (bot.gateway.value === "Offline") return "offline";
  return "unknown";
}

function OverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const next = await getOverview();
      setData(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The overview could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 10_000);
    return () => window.clearInterval(id);
  }, [load]);

  if (loading && !data) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </div>
    );
  }

  if (!data) {
    return (
      <p role="alert" className="rounded-lg border border-danger/40 px-4 py-3 text-sm">
        {error}
      </p>
    );
  }

  const bot = data.bot;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-medium">Overview</h1>
          <p className="mt-1 text-sm text-muted">Refreshes every 10 seconds. Unavailable means the source did not report a value.</p>
        </div>
        <Button onClick={() => void load()}>
          <RefreshCw className="size-4" />
          Refresh
        </Button>
      </div>
      {error ? (
        <p role="alert" className="rounded-lg border border-warn/40 px-4 py-3 text-sm text-warn">
          Latest refresh failed: {error}. Previous values are still shown.
        </p>
      ) : null}
      {bot.configurationError ? (
        <p role="alert" className="rounded-lg border border-danger/40 px-4 py-3 text-sm">
          {bot.configurationError}
        </p>
      ) : null}
      <Panel
        title="Bot"
        action={<StatusDot state={gatewayState(bot)} />}
      >
        <div className="flex flex-col gap-5 sm:flex-row">
          {bot.avatarUrl ? (
            <img src={bot.avatarUrl} alt="" className="size-20 rounded-lg border border-line" />
          ) : (
            <div className="grid size-20 place-items-center rounded-lg border border-dashed border-line text-xs text-faint">
              No avatar
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xl font-medium">{bot.name ?? "Name unavailable"}</p>
            <p className="text-sm text-muted">{bot.username ? `@${bot.username}` : "Username unavailable"}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-faint">{bot.expectedBotId}</span>
              <CopyButton value={bot.expectedBotId} label="Copy bot ID" />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone={bot.restReachable ? "ok" : "neutral"}>
                {bot.restReachable ? "Discord REST reachable" : "Discord REST not confirmed"}
              </Badge>
              <Badge tone={bot.verification === "verified" ? "ok" : "neutral"}>
                {bot.verification === "verified"
                  ? "Verified by Discord"
                  : bot.verification === "not_confirmed"
                    ? "Verification not confirmed"
                    : "Verification unavailable"}
              </Badge>
            </div>
          </div>
        </div>
        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
          <Info label="Application ID" value={bot.applicationId ?? "Unavailable"} />
          <Info label="Account created" value={bot.createdAt ? new Date(bot.createdAt).toLocaleString() : "Unavailable"} />
          <Info label="Last refresh" value={when(bot.refreshedAt)} />
          <Info label="Invite" value={bot.inviteUrl ? "Ready" : "Needs DISCORD_CLIENT_ID"} />
        </dl>
        {bot.inviteUrl ? (
          <a className="mt-4 inline-flex min-h-11 items-center text-sm text-accent" href={bot.inviteUrl} target="_blank" rel="noreferrer">
            Open bot invite
          </a>
        ) : null}
        {bot.notes.length > 0 ? (
          <ul className="mt-4 space-y-1 text-sm text-muted">
            {bot.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}
      </Panel>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Panel>
          <MetricBlock label="Servers" metric={bot.guildCount} />
        </Panel>
        <Panel>
          <MetricBlock label="Total users" metric={bot.userCount} />
        </Panel>
        <Panel>
          <MetricBlock label="Uptime" metric={bot.uptime} />
        </Panel>
        <Panel>
          <MetricBlock label="Latency" metric={bot.latency} />
        </Panel>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Applications in the database">
          <div className="grid grid-cols-3 gap-3">
            <Count label="Pending" value={data.applications.pending} />
            <Count label="Approved" value={data.applications.approved} />
            <Count label="Rejected" value={data.applications.rejected} />
          </div>
          <p className="mt-3 text-xs text-faint">These counts are rows stored by this panel, not estimated Discord totals.</p>
        </Panel>
        <Panel title="System health">
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between gap-3">
              <span>Database</span>
              <span className={data.health.database.ok ? "text-ok" : "text-danger"}>
                {data.health.database.ok ? `Connected · ${data.health.database.latencyMs ?? 0} ms` : "Unavailable"}
              </span>
            </li>
            <li className="flex justify-between gap-3">
              <span>Backend</span>
              <span className="text-muted">{data.health.database.source === "neon" ? "Postgres" : "Local preview database"}</span>
            </li>
            <li className="flex justify-between gap-3">
              <span>OAuth</span>
              <span className={data.health.oauthConfigured ? "text-ok" : "text-faint"}>
                {data.health.oauthConfigured ? "Configured" : "Not configured"}
              </span>
            </li>
          </ul>
        </Panel>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Recent activity">
          <Activity items={data.recent} empty="No audit or bot events have been stored yet." />
        </Panel>
        <Panel title="Recent moderation">
          <Activity items={data.moderation} empty="No moderation events have been recorded." />
        </Panel>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 break-all font-mono text-sm">{value}</dd>
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="font-mono text-2xl tabular-nums">{value}</p>
    </div>
  );
}

function Activity({ items, empty }: { items: Overview["recent"]; empty: string }) {
  if (items.length === 0) return <Empty title="Nothing yet" body={empty} />;
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id} className="border-b border-line pb-3 last:border-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={item.level === "error" ? "danger" : item.level === "warn" ? "warn" : "neutral"}>{item.kind}</Badge>
            <span className="text-xs text-faint">{when(item.at)}</span>
          </div>
          <p className="mt-1 text-sm">{item.message}</p>
        </li>
      ))}
    </ul>
  );
}
