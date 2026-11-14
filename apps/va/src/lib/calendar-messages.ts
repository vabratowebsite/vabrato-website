import type { SyncResult } from "@/lib/calendar-sync";
import type { ActionState } from "@/lib/lead-actions";

// What a person reads after a Google Calendar sync (Integrations PR 1).
export function syncMessage(r: SyncResult): ActionState {
  switch (r.status) {
    case "synced":
      if (r.failed) return { error: `Google Calendar was partly updated: ${r.failed} change${r.failed === 1 ? "" : "s"} didn't go through. Try Sync now again later.` };
      return { error: null, ok: r.changes ? `Google Calendar updated (${r.changes} change${r.changes === 1 ? "" : "s"}${r.capped ? "; more on the next sync" : ""}).` : "Google Calendar is up to date." };
    case "not_connected":
      return { error: "Connect Google Calendar first." };
    case "off":
      return { error: "Google Calendar isn't set up yet." };
    case "reconnect":
      return { error: "Google needs you to reconnect: use Connect again." };
    default:
      return { error: "Google Calendar couldn't be updated. Try Sync now again in a few minutes." };
  }
}
