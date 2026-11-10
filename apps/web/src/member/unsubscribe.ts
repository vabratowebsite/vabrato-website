import { publicWriteSupabase } from "@/lib/public/supabase";

// Alert-email unsubscribe (review item 15). The token is the member's random,
// non-expiring alerts_unsubscribe_token; the DB function is the only action
// a signed-out visitor can take with it.

export const UNSUBSCRIBE_TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function unsubscribeAlerts(token: string): Promise<boolean> {
  if (!UNSUBSCRIBE_TOKEN.test(token)) return false;
  const { data, error } = await publicWriteSupabase().rpc("unsubscribe_alert_emails", { p_token: token });
  if (error) {
    console.error("unsubscribe failed", { code: error.code ?? "unknown" });
    throw new Error("unsubscribe failed");
  }
  return data === true;
}
