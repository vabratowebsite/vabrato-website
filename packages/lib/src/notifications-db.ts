// Supabase adapter for the notification processor. Runs with the service-role
// client (trusted server context only) so it can see every due row.

import type { SupabaseDb } from "./auth/server";
import type { DueNotification, NotificationDeps, OutboundEmail } from "./notifications";

export function supabaseNotificationDeps(
  service: SupabaseDb,
  send: (email: OutboundEmail) => Promise<{ error: string | null }>,
  batchSize = 50,
  siteUrl?: string,
  consoleUrl?: string,
): NotificationDeps {
  return {
    siteUrl,
    consoleUrl,
    // Claims due rows (0022: FOR UPDATE SKIP LOCKED), so a poke and the
    // minute sweep running together never send the same email twice.
    async fetchDue(): Promise<DueNotification[]> {
      const { data, error } = await service.rpc("claim_due_notifications", { p_batch: batchSize });
      if (error) throw new Error(`claim_due_notifications failed: ${error.message}`);
      return (data ?? []).map((row) => ({
        id: row.id,
        template_key: row.template_key,
        payload: row.payload ?? {},
        recipientEmail: row.recipient_email ?? row.profile_email ?? null,
        alertsOptedOut: row.alerts_email_opt_in === false,
      }));
    },
    send,
    async markSent(id) {
      await service.rpc("complete_notification", { p_id: id });
    },
    async markFailed(id, reason, permanent = false) {
      console.error(`[notifications] ${id} ${permanent ? "failed" : "will retry"}: ${reason.slice(0, 200)}`);
      await service.rpc("release_notification", { p_id: id, p_reason: reason.slice(0, 500), p_permanent: permanent });
    },
    async markCancelled(id, reason) {
      await service.from("notifications").update({ status: "cancelled", claimed_at: null, failure_reason: reason.slice(0, 500) }).eq("id", id);
    },
  };
}
