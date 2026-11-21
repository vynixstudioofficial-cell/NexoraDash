import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { getOwnerConsole } from "@/lib/nexora/fns";
import type { OwnerConsole } from "@/lib/nexora/types";
import { Empty, MetricBlock, Panel, Skeleton, when } from "@/components/nexora/ui";

export const Route = createFileRoute("/_app/owner")({
  component: OwnerPage,
});

function OwnerPage() {
  const [data, setData] = useState<OwnerConsole | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await getOwnerConsole());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The owner console refused this account.");
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 10_000);
    return () => window.clearInterval(id);
  }, [load]);

  if (error) {
    return (
      <div className="space-y-3">
        <h1 className="text-3xl font-medium">Owner</h1>
        <p role="alert" className="rounded-lg border border-danger/40 px-4 py-3 text-sm">{error}</p>
      </div>
    );
  }
  if (!data) return <Skeleton />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-medium">Owner console</h1>
        <p className="mt-1 text-sm text-muted">Restricted to DISCORD_OWNER_ID. Secrets and shell access are not available here.</p>
      </div>
      {data.bot.configurationError ? (
        <p role="alert" className="rounded-lg border border-danger/40 px-4 py-3 text-sm">{data.bot.configurationError}</p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Panel><MetricBlock label="Servers" metric={data.bot.guildCount} /></Panel>
        <Panel><MetricBlock label="Total users" metric={data.bot.userCount} /></Panel>
        <Panel><MetricBlock label="Uptime" metric={data.bot.uptime} /></Panel>
        <Panel><MetricBlock label="Latency" metric={data.bot.latency} /></Panel>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Database">
          <p className={data.health.database.ok ? "text-ok" : "text-danger"}>
            {data.health.database.ok ? `Healthy · ${data.health.database.latencyMs ?? 0} ms` : "Unavailable"}
          </p>
          <p className="mt-2 text-sm text-muted">Active sessions: {data.sessionCount}</p>
          <p className="mt-1 text-sm text-muted">
            Applications — pending {data.applications.pending}, approved {data.applications.approved}, rejected {data.applications.rejected}
          </p>
        </Panel>
        <Panel title="Identity">
          <p className="font-mono text-sm">{data.bot.expectedBotId}</p>
          <p className="mt-2 text-sm text-muted">{data.bot.username ? `@${data.bot.username}` : "Username unavailable"}</p>
          <p className="mt-1 text-xs text-faint">Refreshed {when(data.bot.refreshedAt)}</p>
        </Panel>
      </div>
      <Panel title="Recent errors">
        {data.recentErrors.length === 0 ? (
          <Empty title="No stored errors" body="The bot has not posted an error event, or the bridge is not connected." />
        ) : (
          <ul className="space-y-3">
            {data.recentErrors.map((item) => (
              <li key={item.id} className="text-sm">
                <p className="text-xs text-faint">{when(item.at)}</p>
                <p>{item.message}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
