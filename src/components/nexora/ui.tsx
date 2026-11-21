import * as AlertDialog from "@radix-ui/react-alert-dialog";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { useId, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import type { Metric } from "@/lib/nexora/types";

export function Mark({ className = "size-9" }: { className?: string }) {
  return <img src="/logo.png" alt="" className={`rounded-lg object-cover ${className}`} />;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "quiet" | "danger";
};

export function Button({ variant = "quiet", className = "", type = "button", ...props }: ButtonProps) {
  const styles =
    variant === "primary"
      ? "bg-accent text-accent-fg nx-glow hover:brightness-110"
      : variant === "danger"
        ? "border border-danger/40 text-danger hover:bg-danger/10"
        : "border border-line bg-subtle text-fg hover:border-accent/50";
  return (
    <button
      type={type}
      className={`nx-press inline-flex min-h-11 items-center justify-center gap-2 rounded-sm px-4 text-sm font-medium transition duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
      {...props}
    />
  );
}

export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`min-w-0 rounded-xl border border-line bg-elevated p-5 ${className}`}>
      {title ? (
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-medium">{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Field({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-muted">
        {label}
      </label>
      <input
        id={id}
        className="h-11 w-full rounded-sm border border-line bg-bg px-3 text-sm text-fg outline-none"
        {...props}
      />
    </div>
  );
}

export function Area({ label, ...props }: { label: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-muted">
        {label}
      </label>
      <textarea
        id={id}
        className="min-h-28 w-full rounded-md border border-line bg-bg px-3 py-2 text-sm text-fg outline-none"
        {...props}
      />
    </div>
  );
}

export function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-muted">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-sm border border-line bg-bg px-3 text-sm text-fg outline-none"
      >
        {children}
      </select>
    </div>
  );
}

export function MetricBlock({ label, metric }: { label: string; metric: Metric }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium tracking-wide text-muted uppercase">{label}</p>
      {metric.state === "value" ? (
        <p className="mt-1 font-mono text-xl font-medium tabular-nums">{metric.value}</p>
      ) : (
        <p className="mt-1 text-sm text-faint">Unavailable</p>
      )}
      <p className="mt-1 text-xs text-faint">
        {metric.state === "value" ? metric.hint ?? "Live value" : metric.reason}
      </p>
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "ok" | "warn" | "danger";
}) {
  const toneClass =
    tone === "ok"
      ? "text-ok"
      : tone === "warn"
        ? "text-warn"
        : tone === "danger"
          ? "text-danger"
          : "text-muted";
  return (
    <span className={`inline-flex min-h-7 items-center rounded-sm border border-line px-2 text-xs font-medium ${toneClass}`}>
      {children}
    </span>
  );
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-4 py-8 text-center">
      <p className="font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">{body}</p>
    </div>
  );
}

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      className="shrink-0"
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          toast.success("Copied");
          window.setTimeout(() => setDone(false), 1500);
        } catch {
          toast.error("Clipboard is not available in this browser.");
        }
      }}
    >
      {done ? <Check className="size-4" /> : <Copy className="size-4" />}
      Copy
    </Button>
  );
}

export function StatusDot({ state }: { state: "online" | "offline" | "unknown" }) {
  const color = state === "online" ? "bg-ok nx-live" : state === "offline" ? "bg-danger nx-off" : "bg-faint";
  const label = state === "online" ? "Online" : state === "offline" ? "Offline" : "Unavailable";
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted">
      <span className={`size-2.5 rounded-full ${color}`} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function Skeleton() {
  return <div className="nx-pulse h-24 animate-pulse rounded-xl bg-subtle" />;
}

export function Confirm({
  open,
  title,
  body,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onOpenChange,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-bg/70" />
        <AlertDialog.Content className="fixed inset-x-4 top-1/2 z-50 mx-auto max-w-md -translate-y-1/2 rounded-xl border border-line bg-elevated p-5">
          <AlertDialog.Title className="text-lg font-medium">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-muted">{body}</AlertDialog.Description>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button disabled={busy}>Cancel</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant={danger ? "danger" : "primary"} disabled={busy} onClick={onConfirm}>
                {busy ? "Working…" : confirmLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export function when(iso: string | null | undefined): string {
  if (!iso) return "Not recorded";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return date.toLocaleString();
}
