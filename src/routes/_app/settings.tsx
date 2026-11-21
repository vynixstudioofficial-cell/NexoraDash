import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getIntegrationStatus } from "@/lib/nexora/fns";
import type { IntegrationStatus } from "@/lib/nexora/types";
import { Badge, CopyButton, Panel, Skeleton } from "@/components/nexora/ui";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getIntegrationStatus()
      .then(setStatus)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Status could not be loaded."));
  }, []);

  if (error) return <p role="alert" className="text-sm text-danger">{error}</p>;
  if (!status) return <Skeleton />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-medium">Connection</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Secret values stay on the server. This page only shows whether each one is set. No separate command source was included with this project, so command, AI, and permission toggles from that code are not shown.
        </p>
      </div>
      <Panel title="Server configuration">
        <ul className="space-y-3 text-sm">
          <Row label="OAuth client" ok={status.oauthConfigured} />
          <Row label="Session secret" ok={status.sessionSecretConfigured} />
          <Row label="Bot token" ok={status.botTokenConfigured} />
          <Row label="Runtime link" ok={status.runtimeConfigured} />
          <Row label="Owner ID" ok={status.ownerConfigured} />
          <Row label="Database" ok={status.database.ok} />
        </ul>
        {status.missing.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {status.missing.map((name) => (
              <Badge key={name} tone="warn">{name}</Badge>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-ok">Every integration variable this panel knows about is set.</p>
        )}
      </Panel>
      <Panel title="Discord portal">
        <p className="text-sm text-muted">Register this exact redirect URI on the Discord application. The bot user ID stays {status.botId}. The OAuth client ID is separate.</p>
        <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-3">
          <p className="truncate font-mono text-sm">{status.redirectUri ?? "Unavailable"}</p>
          {status.redirectUri ? <CopyButton value={status.redirectUri} label="Copy redirect URI" /> : null}
        </div>
        {status.runtimeUrlError ? <p className="mt-3 text-sm text-danger">{status.runtimeUrlError}</p> : null}
        {status.botIdMismatch ? (
          <p className="mt-3 text-sm text-danger">DISCORD_BOT_ID does not match {status.botId}.</p>
        ) : null}
      </Panel>
    </div>
  );
}

function Row({ label, ok }: { label: string; ok: boolean }) {
  return (
    <li className="flex items-center justify-between border-b border-line pb-3 last:border-0">
      <span>{label}</span>
      <span className={ok ? "text-ok" : "text-faint"}>{ok ? "Configured" : "Not configured"}</span>
    </li>
  );
}
