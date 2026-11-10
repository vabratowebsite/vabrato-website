// Supabase adapter for the notification processor. Runs with the service-role
// client (trusted server context only) so it can see every due row.

import type { SupabaseDb } from "./auth/server";
import type { DueNotification, NotificationDeps, OutboundEmail } from "./notifications";

export function supabaseNotificationDeps(
  service: SupabaseDb,
  send: (email: OutboundEmail) => Promise<{ error: string | null }>,
  batchSize = 50,
  siteUrl?: string,
): NotificationDeps {
  return {
    siteUrl,
    async fetchDue(): Promise<DueNotification[]> {
      const { data, error } = await service
        .from("notifications")
        .select("id, template_key, payload, recipient_email, profiles:recipient_profile_id(email, alerts_email_opt_in)")
        .eq("status", "scheduled")
        .lte("send_at", new Date().toISOString())
        .order("send_at")
        .limit(batchSize);
      if (error) throw new Error(`fetchDue failed: ${error.message}`);
      return (data ?? []).map((row) => ({
        id: row.id,
        template_key: row.template_key,
        payload: row.payload ?? {},
        recipientEmail: row.recipient_email ?? row.profiles?.email ?? null,
        alertsOptedOut: row.profiles ? row.profiles.alerts_email_opt_in === false : false,
      }));
    },
    send,
    async markSent(id) {
      await service
        .from("notifications")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", id);
    },
    async markFailed(id, reason) {
      console.error(`[notifications] ${id} failed: ${reason}`);
      await service.from("notifications").update({ status: "failed", failure_reason: reason.slice(0, 500) }).eq("id", id);
    },
    async markCancelled(id, reason) {
      await service.from("notifications").update({ status: "cancelled", failure_reason: reason.slice(0, 500) }).eq("id", id);
    },
  };
}
