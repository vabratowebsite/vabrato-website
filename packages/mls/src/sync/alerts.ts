// Member alerts after a sync (S5 PR 3). The matching itself is one database
// function, run_member_alerts() (0018), so the sync job needs no access to
// member tables: only EXECUTE on that function (RENDER.md). Emails go out
// through the existing notifications processor (apps/va), which this step
// pokes right after queueing, so a feed change reaches the member within one
// sync interval (15 minutes) plus run time.

import type { Sql } from "./sql";

export interface AlertRunResult {
  initialized?: boolean;
  deliveries?: number;
  instant_emails?: number;
  digest_emails?: number;
  purged?: { deliveries: number; emails: number };
}

export async function runMemberAlerts(sql: Sql, now?: Date): Promise<AlertRunResult> {
  const rows = now
    ? await sql.query<{ r: AlertRunResult }>(`select public.run_member_alerts($1::timestamptz) as r`, [now.toISOString()])
    : await sql.query<{ r: AlertRunResult }>(`select public.run_member_alerts() as r`);
  return rows[0]?.r ?? {};
}

/**
 * POSTs the notifications processor (NOTIFICATIONS_PROCESS_URL, Bearer
 * NOTIFICATIONS_CRON_SECRET). Returns false when not configured or on error;
 * queued emails then wait for the next run.
 */
export async function pokeNotificationProcessor(env: Record<string, string | undefined>, doFetch: typeof fetch = fetch): Promise<boolean> {
  const url = env.NOTIFICATIONS_PROCESS_URL;
  const secret = env.NOTIFICATIONS_CRON_SECRET;
  if (!url || !secret) return false;
  try {
    const res = await doFetch(url, { method: "POST", headers: { authorization: `Bearer ${secret}` } });
    if (!res.ok) console.error(`notification processor returned ${res.status}`);
    return res.ok;
  } catch {
    console.error("notification processor unreachable (network error)");
    return false;
  }
}

export const alertsEnabled = (env: Record<string, string | undefined>) => env.ALERTS_ENABLED === "true";
