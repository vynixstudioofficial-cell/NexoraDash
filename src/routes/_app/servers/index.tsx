import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { getGuildList } from "@/lib/nexora/fns";
import type { GuildList } from "@/lib/nexora/types";
import { accessLabel } from "@/lib/nexora/pure";
import { Badge, Button, CopyButton, Empty, Panel, Skeleton } from "@/components/nexora/ui";

export const Route = createFileRoute("/_app/servers/")({
  component: ServersPage,
});

function ServersPage() {
  const [data, setData] = useState<GuildList | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await getGuildList());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Servers could not be loaded.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-medium">Servers</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Only servers Discord returned for your account are listed. Management opens when you can actually administer them.
          </p>
        </div>
        {data?.inviteUrl ? (
          <a href={data.inviteUrl} target="_blank" rel="noreferrer">
            <Button variant="primary">Invite bot</Button>
          </a>
        ) : (
          <Button disabled>Invite needs DISCORD_CLIENT_ID</Button>
        )}
      </div>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      {!data && !error ? <Skeleton /> : null}
      {data?.guildsStale ? (
        <p className="text-sm text-warn">This server list is from your last sign-in and the Discord token has expired. Sign in again to refresh it.</p>
      ) : null}
      {data ? <p className="text-sm text-faint">{data.presenceDetail}</p> : null}
      {data && data.guilds.length === 0 ? (
        <Empty title="No servers returned" body="Discord did not include any servers for this account. The identify and guilds scopes are both requested." />
      ) : null}
      <div className="grid gap-4">
        {data?.guilds.map((guild) => (
          <Panel key={guild.id}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              {guild.iconUrl ? (
                <img src={guild.iconUrl} alt="" className="size-14 rounded-lg" />
              ) : (
                <div className="grid size-14 place-items-center rounded-lg bg-subtle text-lg font-medium">
                  {guild.name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg">{guild.name}</h2>
                <p className="font-mono text-xs text-faint">{guild.id}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge>{accessLabel(guild.access)}</Badge>
                  <Badge tone={guild.botPresent === "yes" ? "ok" : guild.botPresent === "no" ? "warn" : "neutral"}>
                    {guild.botPresent === "yes" ? "Bot present" : guild.botPresent === "no" ? "Bot not in server" : "Bot presence unknown"}
                  </Badge>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <CopyButton value={guild.id} label={`Copy server ${guild.name} ID`} />
                {guild.canManage ? (
                  <Link to="/servers/$guildId" params={{ guildId: guild.id }}>
                    <Button variant="primary">Open</Button>
                  </Link>
                ) : (
                  <Button disabled>Insufficient permission</Button>
                )}
              </div>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
