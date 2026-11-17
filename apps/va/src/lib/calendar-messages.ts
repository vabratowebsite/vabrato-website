import type { SyncResult } from "@/lib/team-calendar";
import type { ActionState } from "@/lib/lead-actions";

// What a person reads after a team calendar sync (0045).
export function syncMessage(r: SyncResult): ActionState {
  switch (r.status) {
    case "synced": {
      const fresh = r.recreated ? "The “Vabrato” calendar was deleted in Google, so a new one was made: share it with the team again. " : "";
      if (r.failed) return { error: `${fresh}The team calendar was partly updated: ${r.failed} change${r.failed === 1 ? "" : "s"} didn't go through. Try Sync now again later.` };
      if (r.recreated) return { error: fresh.trim() };
      return { error: null, ok: r.changes ? `Team calendar updated (${r.changes} change${r.changes === 1 ? "" : "s"}${r.capped ? "; more on the next sync" : ""}).` : "The team calendar is up to date." };
    }
    case "not_connected":
      return { error: "The team calendar isn't connected yet." };
    case "off":
      return { error: "The team calendar isn't set up yet." };
    case "busy":
      return { error: "The team calendar is being updated right now. Try again in a minute." };
    case "reconnect":
      return { error: "Google needs an admin to reconnect the team calendar." };
    case "calendar_gone":
      return { error: "The “Vabrato” calendar couldn't be made again in Google. An admin can reconnect the team calendar." };
    default:
      return { error: "The team calendar couldn't be updated. Try Sync now again in a few minutes." };
  }
}
