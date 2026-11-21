import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getGuildDetail, getSessionView, resetSettings, saveSettings } from "@/lib/nexora/fns";
import type { GuildDetail, GuildSettings } from "@/lib/nexora/types";
import { accessLabel } from "@/lib/nexora/pure";
import { Area, Badge, Button, Confirm, CopyButton, Empty, Field, MetricBlock, Panel, Select, Skeleton, when } from "@/components/nexora/ui";

export const Route = createFileRoute("/_app/servers/$guildId")({
  component: GuildPage,
});

function blankForm(): GuildSettings {
  return {
    theme: "community",
    welcomeEnabled: false,
    welcomeChannelId: "",
    welcomeMessage: "",
    leaveEnabled: false,
    leaveChannelId: "",
    leaveMessage: "",
    joinRoleId: "",
    automod: false,
    linkFilter: false,
    bannedWords: "",
    levelChannelId: "",
    ticketPanelStyle: "button",
    ticketCategoryId: "",
    verificationEnabled: false,
    verificationChannelId: "",
    verifiedRoleId: "",
    unverifiedRoleId: "",
    verificationMethod: "button",
    ticketTypes: [],
    applyForms: [],
    updatedAt: null,
    updatedBy: null,
    usingBotFile: false,
  };
}

function GuildPage() {
  const { guildId } = Route.useParams();
  const [data, setData] = useState<GuildDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(blankForm);
  const [csrf, setCsrf] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [tab, setTab] = useState<"general" | "moderation" | "applications">("general");

  useEffect(() => {
    let stop = false;
    void (async () => {
      try {
        const [detail, me] = await Promise.all([getGuildDetail({ data: { guildId } }), getSessionView()]);
        if (stop) return;
        if (!me.authenticated) throw new Error("Sign in with Discord to continue.");
        setCsrf(me.csrfToken);
        setData(detail);
        setForm(detail.settings);
      } catch (err) {
        if (!stop) setError(err instanceof Error ? err.message : "This server could not be loaded.");
      }
    })();
    return () => {
      stop = true;
    };
  }, [guildId]);

  async function save() {
    setBusy(true);
    const { ticketTypes, applyForms, updatedAt, updatedBy, usingBotFile, ...fields } = form;
    const result = await saveSettings({ data: { guildId, csrf, ...fields } });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Settings saved.");
    const detail = await getGuildDetail({ data: { guildId } });
    setData(detail);
    setForm(detail.settings);
  }

  async function reset() {
    setBusy(true);
    const result = await resetSettings({ data: { guildId, csrf } });
    setBusy(false);
    setConfirm(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    const detail = await getGuildDetail({ data: { guildId } });
    setData(detail);
    setForm(detail.settings);
    toast.success("Saved overrides cleared.");
  }

  if (error) return <p role="alert" className="text-sm text-danger">{error}</p>;
  if (!data) return <Skeleton />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-4">
        {data.guild.iconUrl ? (
          <img src={data.guild.iconUrl} alt="" className="size-16 rounded-lg" />
        ) : (
          <div className="grid size-16 place-items-center rounded-lg bg-subtle text-xl">{data.guild.name.slice(0, 1)}</div>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-3xl font-medium">{data.liveName || data.guild.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-faint">{data.guild.id}</span>
            <CopyButton value={data.guild.id} label="Copy server ID" />
            <Badge>{accessLabel(data.guild.access)}</Badge>
            <Badge tone={data.guild.botPresent === "yes" ? "ok" : data.guild.botPresent === "no" ? "warn" : "neutral"}>
              {data.guild.botPresent === "yes" ? "Bot in server" : data.guild.botPresent === "no" ? "Bot not in server" : "Bot presence unknown"}
            </Badge>
          </div>
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto" role="tablist" aria-label="Server sections">
        {(
          [
            ["general", "General"],
            ["moderation", "Moderation"],
            ["applications", "Applications"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`min-h-11 rounded-sm px-4 text-sm ${tab === id ? "bg-subtle text-fg" : "text-muted"}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "general" ? (
        <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <Panel title="Live server">
            <div className="grid gap-4">
              <MetricBlock label="Approximate members" metric={data.memberCount} />
              <MetricBlock label="Approximate online" metric={data.onlineCount} />
            </div>
          </Panel>
          <Panel title="Server settings">
            <p className="mb-4 text-sm text-muted">
              {data.settings.usingBotFile
                ? "These values are from the bot's guild_settings.json. Saving stores a copy in this panel."
                : "These values were saved in this panel."}{" "}
              The live bot still reads its own file until that file is updated.
            </p>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <Select label="Theme" value={form.theme} onChange={(theme) => setForm({ ...form, theme })}>
                <option value="community">Community</option>
                <option value="gaming">Gaming</option>
                <option value="professional">Professional</option>
                <option value="anime">Anime</option>
              </Select>
              <Check label="Welcome messages" checked={form.welcomeEnabled} onChange={(welcomeEnabled) => setForm({ ...form, welcomeEnabled })} />
              <Field label="Welcome channel ID" value={form.welcomeChannelId} onChange={(event) => setForm({ ...form, welcomeChannelId: event.target.value })} inputMode="numeric" />
              <Area label="Welcome message" value={form.welcomeMessage} onChange={(event) => setForm({ ...form, welcomeMessage: event.target.value })} maxLength={2000} />
              <Check label="Leave messages" checked={form.leaveEnabled} onChange={(leaveEnabled) => setForm({ ...form, leaveEnabled })} />
              <Field label="Leave channel ID" value={form.leaveChannelId} onChange={(event) => setForm({ ...form, leaveChannelId: event.target.value })} inputMode="numeric" />
              <Area label="Leave message" value={form.leaveMessage} onChange={(event) => setForm({ ...form, leaveMessage: event.target.value })} maxLength={2000} />
              <Field label="Join role ID" value={form.joinRoleId} onChange={(event) => setForm({ ...form, joinRoleId: event.target.value })} inputMode="numeric" />
              <p className="text-xs text-faint">
                {data.settings.updatedAt ? `Last saved ${when(data.settings.updatedAt)}` : "Not saved in this panel yet"}
                {data.settings.updatedBy ? ` by ${data.settings.updatedBy}` : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
                <Button variant="danger" disabled={busy} onClick={() => setConfirm(true)}>Reset</Button>
              </div>
            </form>
          </Panel>
        </div>
      ) : null}
      {tab === "moderation" ? (
        <Panel title="Moderation filters">
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <Check label="Word filter" checked={form.automod} onChange={(automod) => setForm({ ...form, automod })} />
            <Check label="Link filter" checked={form.linkFilter} onChange={(linkFilter) => setForm({ ...form, linkFilter })} />
            <Area label="Filtered words, one per line" value={form.bannedWords} onChange={(event) => setForm({ ...form, bannedWords: event.target.value })} maxLength={2000} />
            <Field label="Level-up channel ID" value={form.levelChannelId} onChange={(event) => setForm({ ...form, levelChannelId: event.target.value })} inputMode="numeric" />
            <Check label="Verification" checked={form.verificationEnabled} onChange={(verificationEnabled) => setForm({ ...form, verificationEnabled })} />
            <Field label="Verification channel ID" value={form.verificationChannelId} onChange={(event) => setForm({ ...form, verificationChannelId: event.target.value })} inputMode="numeric" />
            <Field label="Verified role ID" value={form.verifiedRoleId} onChange={(event) => setForm({ ...form, verifiedRoleId: event.target.value })} inputMode="numeric" />
            <Field label="Unverified role ID" value={form.unverifiedRoleId} onChange={(event) => setForm({ ...form, unverifiedRoleId: event.target.value })} inputMode="numeric" />
            <Select label="Verification method" value={form.verificationMethod} onChange={(verificationMethod) => setForm({ ...form, verificationMethod })}>
              <option value="button">Button</option>
              <option value="reaction">Reaction</option>
            </Select>
            <Button variant="primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          </form>
        </Panel>
      ) : null}
      {tab === "applications" ? (
        <div className="space-y-4">
          <Panel title="Tickets">
            <Select label="Panel style" value={form.ticketPanelStyle} onChange={(ticketPanelStyle) => setForm({ ...form, ticketPanelStyle })}>
              <option value="button">Buttons</option>
              <option value="dropdown">Dropdown</option>
            </Select>
            <div className="mt-4">
              <Field label="Ticket category ID" value={form.ticketCategoryId} onChange={(event) => setForm({ ...form, ticketCategoryId: event.target.value })} inputMode="numeric" />
            </div>
            {data.settings.ticketTypes.length === 0 ? (
              <p className="mt-4 text-sm text-muted">No ticket types are saved for this server.</p>
            ) : (
              <ul className="mt-4 space-y-2 text-sm">
                {data.settings.ticketTypes.map((type) => (
                  <li key={type.id} className="flex justify-between gap-3 border-b border-line pb-2">
                    <span>{type.name}</span>
                    <span className="text-faint">{type.label || type.id}</span>
                  </li>
                ))}
              </ul>
            )}
            <Button className="mt-4" variant="primary" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
          </Panel>
          <Panel title="Application forms">
            {data.settings.applyForms.length === 0 ? (
              <Empty title="No application forms" body="This server has no form in the bot's apply_configs.json." />
            ) : (
              <ul className="space-y-4">
                {data.settings.applyForms.map((formRow) => (
                  <li key={formRow.name}>
                    <p className="font-medium">{formRow.title}</p>
                    <p className="text-xs text-faint">{formRow.questions.length} questions</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}
      <Confirm
        open={confirm}
        title="Reset stored settings?"
        body="This removes the panel's saved copy and shows the uploaded bot file again. It does not edit the file on the host."
        confirmLabel="Reset settings"
        danger
        busy={busy}
        onOpenChange={setConfirm}
        onConfirm={() => void reset()}
      />
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-center gap-3 text-sm">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}
