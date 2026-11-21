import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { getLogs } from "@/lib/nexora/fns";
import type { LogPage } from "@/lib/nexora/types";
import { Badge, Button, Empty, Panel, Select, Skeleton, when } from "@/components/nexora/ui";

export const Route = createFileRoute("/_app/logs")({
  component: LogsPage,
});

function LogsPage() {
  const [page, setPage] = useState(1);
  const [level, setLevel] = useState("all");
  const [kind, setKind] = useState("all");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<LogPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(
        await getLogs({
          data: {
            page,
            level: level === "all" ? undefined : level,
            kind: kind === "all" ? undefined : kind,
            q: query || undefined,
          },
        }),
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Logs could not be loaded.");
    }
  }, [page, level, kind, query]);

  useEffect(() => {
    void load();
  }, [load]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-medium">Logs</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Audit entries and events posted by the bot. Messages are redacted if they contain token-shaped text.
        </p>
      </div>
      <form
        className="grid gap-3 md:grid-cols-[1fr_10rem_10rem_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setQuery(q);
        }}
      >
        <div>
          <label htmlFor="log-search" className="mb-2 block text-sm font-medium text-muted">Search</label>
          <input
            id="log-search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            className="h-11 w-full rounded-sm border border-line bg-bg px-3 text-sm"
          />
        </div>
        <Select label="Level" value={level} onChange={(value) => { setPage(1); setLevel(value); }}>
          <option value="all">All</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
        </Select>
        <Select label="Kind" value={kind} onChange={(value) => { setPage(1); setKind(value); }}>
          <option value="all">All</option>
          <option value="audit">Audit</option>
          <option value="moderation">Moderation</option>
          <option value="application">Application</option>
          <option value="system">System</option>
        </Select>
        <div className="flex items-end">
          <Button variant="primary" type="submit">Apply</Button>
        </div>
      </form>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      {!data && !error ? <Skeleton /> : null}
      {data && data.items.length === 0 ? (
        <Empty title="No matching logs" body="Nothing in the database matches these filters for servers you can manage." />
      ) : null}
      {data && data.items.length > 0 ? (
        <Panel>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <caption className="sr-only">Bot and audit logs</caption>
              <thead className="text-xs text-muted">
                <tr>
                  <th className="pb-2 font-medium">When</th>
                  <th className="pb-2 font-medium">Kind</th>
                  <th className="pb-2 font-medium">Server</th>
                  <th className="pb-2 font-medium">Message</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id} className="border-t border-line">
                    <td className="py-3 pr-3 align-top whitespace-nowrap text-faint">{when(item.at)}</td>
                    <td className="py-3 pr-3 align-top">
                      <Badge tone={item.level === "error" ? "danger" : item.level === "warn" ? "warn" : "neutral"}>{item.kind}</Badge>
                    </td>
                    <td className="py-3 pr-3 align-top font-mono text-xs">{item.guildId ?? "System"}</td>
                    <td className="py-3 align-top">{item.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-xs text-faint">{data.total} entries</p>
            <div className="flex gap-2">
              <Button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button>
              <Button disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Next</Button>
            </div>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
