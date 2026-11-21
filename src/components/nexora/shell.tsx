import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { ClipboardList, LayoutDashboard, Menu, ScrollText, Server, Settings, Shield, X } from "lucide-react";
import { toast } from "sonner";
import { previewPathPrefix } from "@/lib/preview-path-prefix";
import { signOut } from "@/lib/nexora/fns";
import type { SessionView } from "@/lib/nexora/types";
import { Button, Mark } from "./ui";

type Authed = Extract<SessionView, { authenticated: true }>;

const links = [
  { to: "/", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/servers", label: "Servers", icon: Server, exact: false },
  { to: "/applications", label: "Applications", icon: ClipboardList, exact: false },
  { to: "/logs", label: "Logs", icon: ScrollText, exact: false },
  { to: "/settings", label: "Connection", icon: Settings, exact: false },
] as const;

export function Shell({ me }: { me: Authed }) {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const items = me.isOwner
    ? [...links, { to: "/owner" as const, label: "Owner", icon: Shield, exact: false }]
    : [...links];

  async function logout() {
    setBusy(true);
    try {
      await signOut({ data: { csrf: me.csrfToken } });
      const prefix = previewPathPrefix(window.location.hostname, window.location.pathname) ?? "";
      window.location.assign(`${prefix}/login`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Logout failed.");
      setBusy(false);
    }
  }

  const nav = (
    <nav className="flex flex-1 flex-col gap-1" aria-label="Dashboard">
      {items.map((item) => {
        const active = item.exact ? path === item.to : path.startsWith(item.to);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={() => setOpen(false)}
            className={`flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium ${
              active ? "bg-subtle text-fg" : "text-muted hover:bg-subtle hover:text-fg"
            }`}
            aria-current={active ? "page" : undefined}
          >
            <Icon className="size-4" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="hidden border-r border-line bg-elevated/80 md:flex md:min-h-dvh md:flex-col md:p-4">
        <Brand />
        {nav}
        <Account me={me} busy={busy} onLogout={logout} />
      </aside>
      {open ? (
        <div className="fixed inset-0 z-30 md:hidden">
          <button className="absolute inset-0 bg-bg/70" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="relative flex h-full w-72 max-w-[85%] flex-col border-r border-line bg-elevated p-4">
            <div className="mb-4 flex items-center justify-between">
              <Brand />
              <Button aria-label="Close menu" onClick={() => setOpen(false)}>
                <X className="size-4" />
              </Button>
            </div>
            {nav}
            <Account me={me} busy={busy} onLogout={logout} />
          </div>
        </div>
      ) : null}
      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur-sm md:px-8">
          <div className="flex items-center gap-3">
            <Button className="md:hidden" aria-label="Open menu" onClick={() => setOpen(true)}>
              <Menu className="size-4" />
            </Button>
            <div>
              <p className="font-display text-sm font-medium">Nexora Dashboard</p>
              <p className="text-xs text-faint">Nexora control panel</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <img src={me.user.avatarUrl} alt="" className="size-9 rounded-full border border-line" />
            <div className="hidden sm:block">
              <p className="text-sm font-medium">{me.user.globalName || me.user.username}</p>
              <p className="font-mono text-xs text-faint">{me.user.username}</p>
              {me.user.email ? <p className="text-xs text-faint">{me.user.email}</p> : null}
            </div>
          </div>
        </header>
        <div className="px-4 py-5 md:px-8 md:py-7">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <div className="mb-6 flex items-center gap-3">
      <Mark />
      <div>
        <p className="font-display text-sm font-medium tracking-wide">NEXORA</p>
        <p className="text-xs text-faint">DASHBOARD</p>
      </div>
    </div>
  );
}

function Account({ me, busy, onLogout }: { me: Authed; busy: boolean; onLogout: () => void }) {
  return (
    <div className="mt-4 border-t border-line pt-4">
      <p className="truncate text-sm font-medium">{me.user.globalName || me.user.username}</p>
      <p className="truncate font-mono text-xs text-faint">{me.user.id}</p>
      <Button className="mt-3 w-full" disabled={busy} onClick={onLogout}>
        {busy ? "Signing out…" : "Log out"}
      </Button>
    </div>
  );
}
