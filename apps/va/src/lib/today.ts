// Pure helpers for the Today page (mockup 07), kept out of the page so they
// can be unit-tested.

export const PT = "America/Los_Angeles";

export function fmtWhen(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "never";
  const d = new Date(iso);
  const sameDay = d.toLocaleDateString("en-CA", { timeZone: PT }) === now.toLocaleDateString("en-CA", { timeZone: PT });
  const time = d.toLocaleTimeString("en-US", { timeZone: PT, hour: "numeric", minute: "2-digit" });
  return sameDay ? time : `${d.toLocaleDateString("en-US", { timeZone: PT, month: "short", day: "numeric" })}, ${time}`;
}

export interface SyncRun {
  kind: "incremental" | "reconcile" | "purge";
  status: "running" | "succeeded" | "failed";
  finished_at: string | null;
  counts: Record<string, number> | null;
}

export interface SyncHealth {
  last_success_at: string | null;
  last_failure_at: string | null;
  last_status: "running" | "succeeded" | "failed" | null;
  stale: boolean;
}

/** One line per MLS feed fact on the Today page. `tone` drives the colour; the text says it too. */
export function feedRows(health: SyncHealth | null, runs: SyncRun[], now: Date = new Date()) {
  const inc = runs.find((r) => r.kind === "incremental" && r.status !== "running");
  const rec = runs.find((r) => r.kind === "reconcile" && r.status !== "running");
  const n = (r: SyncRun | undefined, k: string) => Number(r?.counts?.[k] ?? 0);
  const state = !health?.last_success_at ? "No successful sync yet" : health.stale ? "Stale (over 30 min)" : "OK";
  return [
    { label: "Sync health", value: state, tone: !health?.last_success_at || health.stale ? ("red" as const) : ("green" as const) },
    {
      label: "Last incremental sync",
      value: inc ? `${fmtWhen(inc.finished_at, now)} · ${inc.status === "succeeded" ? "OK" : "Failed"}` : "None yet",
      tone: inc?.status === "failed" ? ("red" as const) : ("ink" as const),
    },
    { label: "Changed in last run", value: inc ? `${n(inc, "upserted")} listings · ${n(inc, "media")} photos` : "—", tone: "ink" as const },
    {
      label: "Nightly reconcile",
      value: rec ? `${fmtWhen(rec.finished_at, now)} · ${rec.status === "succeeded" ? `${n(rec, "removed")} removed` : "Failed"}` : "None yet",
      tone: rec?.status === "failed" ? ("red" as const) : ("ink" as const),
    },
  ];
}

const KIND_LABEL: Record<string, string> = {
  contact: "Contact",
  valuation: "Valuation",
  tour: "Tour request",
  transform: "Transform",
  newsletter: "Newsletter",
  open_house_signin: "Open-house sign-in",
};

export const leadKindLabel = (kind: string) => KIND_LABEL[kind] ?? kind;

/** "J. Lee" style short name for lists; falls back to the email's local part. */
export function shortName(name: string | null, email: string): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0]}. ${parts[parts.length - 1]}`;
  if (parts.length === 1) return parts[0]!;
  return email.split("@")[0] ?? email;
}
