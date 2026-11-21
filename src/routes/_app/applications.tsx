import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { getApplications, getBotForms, getSessionView, reviewApplication } from "@/lib/nexora/fns";
import type { ApplicationRow, BotFormGroup } from "@/lib/nexora/types";
import { Badge, Button, Confirm, Empty, Panel, Select, Skeleton, when } from "@/components/nexora/ui";

export const Route = createFileRoute("/_app/applications")({
  component: ApplicationsPage,
});

function ApplicationsPage() {
  const [rows, setRows] = useState<ApplicationRow[] | null>(null);
  const [forms, setForms] = useState<BotFormGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("all");
  const [csrf, setCsrf] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [pending, setPending] = useState<{ id: string; status: "approved" | "rejected" } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, botForms, me] = await Promise.all([
        getApplications({ data: { status: status === "all" ? null : status, guildId: null } }),
        getBotForms(),
        getSessionView(),
      ]);
      if (!me.authenticated) throw new Error("Sign in with Discord to continue.");
      setCsrf(me.csrfToken);
      setRows(list);
      setForms(botForms);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Applications could not be loaded.");
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function commit() {
    if (!pending) return;
    setBusy(true);
    const result = await reviewApplication({
      data: { id: pending.id, csrf, status: pending.status, note },
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(pending.status === "approved" ? "Application approved." : "Application rejected.");
    setPending(null);
    setNote("");
    await load();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-medium">Applications</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Forms below are the ones saved in the bot. Finished applications appear only when the bot sends them to this panel.
          </p>
        </div>
        <div className="w-48">
          <Select label="Status" value={status} onChange={setStatus}>
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </Select>
        </div>
      </div>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      {forms && forms.length > 0 ? (
        <Panel title="Forms on the bot">
          <ul className="space-y-4">
            {forms.map((group) => (
              <li key={group.guildId}>
                <p className="text-sm text-muted">{group.guildName ?? group.guildId}</p>
                {group.forms.map((form) => (
                  <p key={form.name} className="mt-1">{form.title} · {form.questions.length} questions</p>
                ))}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
      {!rows && !error ? <Skeleton /> : null}
      {rows && rows.length === 0 ? (
        <Empty
          title="No applications"
          body="Nothing is stored for the servers you manage. Submissions appear only after the bot posts them."
        />
      ) : null}
      <div className="space-y-3">
        {rows?.map((row) => (
          <Panel key={row.id}>
            <button type="button" className="w-full text-left" onClick={() => setOpenId(openId === row.id ? null : row.id)}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{row.applicantName}</p>
                  <p className="font-mono text-xs text-faint">{row.applicantId}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={row.status === "approved" ? "ok" : row.status === "rejected" ? "danger" : "warn"}>{row.status}</Badge>
                  <Badge>{row.guildName ?? row.guildId}</Badge>
                </div>
              </div>
            </button>
            {openId === row.id ? (
              <div className="mt-4 space-y-3 border-t border-line pt-4">
                {row.answers.length === 0 ? <p className="text-sm text-muted">No answers were stored.</p> : null}
                {row.answers.map((answer, index) => (
                  <div key={`${row.id}-${index}`}>
                    <p className="text-xs text-muted">{answer.question}</p>
                    <p className="text-sm whitespace-pre-wrap">{answer.answer}</p>
                  </div>
                ))}
                <p className="text-xs text-faint">Submitted {when(row.createdAt)}</p>
                {row.reviewerNote ? <p className="text-sm text-muted">Review note: {row.reviewerNote}</p> : null}
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" onClick={() => setPending({ id: row.id, status: "approved" })}>Approve</Button>
                  <Button variant="danger" onClick={() => setPending({ id: row.id, status: "rejected" })}>Reject</Button>
                </div>
              </div>
            ) : null}
          </Panel>
        ))}
      </div>
      <Confirm
        open={pending != null}
        title={pending?.status === "approved" ? "Approve this application?" : "Reject this application?"}
        body="This updates the stored status and writes an audit entry. It does not send a Discord message unless your bot reads the change."
        confirmLabel={pending?.status === "approved" ? "Approve" : "Reject"}
        danger={pending?.status === "rejected"}
        busy={busy}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        onConfirm={() => void commit()}
      />
      {pending ? (
        <div className="max-w-md">
          <label className="mb-2 block text-sm text-muted" htmlFor="review-note">Review note</label>
          <input
            id="review-note"
            value={note}
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
            className="h-11 w-full rounded-sm border border-line bg-bg px-3 text-sm"
          />
        </div>
      ) : null}
    </div>
  );
}
