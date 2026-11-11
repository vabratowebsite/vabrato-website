import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceSupabase, processDueNotifications, resendSender, supabaseNotificationDeps } from "@vabrato/lib";

// Sender for every queued email: seller timeline, buyer alerts, staff lead and
// message alerts (S6). POST with `Authorization: Bearer $CRON_SECRET`.
// Called by the database right after a lead or message (pg_net, 0022), by the
// minute sweep (pg_cron) and by the MLS sync job on Render. Rows are claimed,
// so overlapping calls never send the same email twice.
// PUBLIC_SITE_URL and CONSOLE_URL set the links in emails. RESEND_BASE_URL
// points at a fake Resend in local QA only.

function authorized(header: string | null, secret: string): boolean {
  const a = Buffer.from(header ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !authorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFICATIONS_FROM ?? "Vabrato <notifications@vabrato.com>";
  if (!apiKey) {
    // Resend not set up yet: rows stay scheduled; the console still shows alerts.
    return NextResponse.json({ error: "RESEND_API_KEY not configured; notifications remain scheduled" }, { status: 503 });
  }

  const service = createServiceSupabase();
  const result = await processDueNotifications(
    supabaseNotificationDeps(
      service,
      resendSender(apiKey, from, { baseUrl: process.env.RESEND_BASE_URL }),
      50,
      process.env.PUBLIC_SITE_URL ?? "https://vabrato.com",
      process.env.CONSOLE_URL ?? "https://console.vabrato.com",
    ),
  );
  return NextResponse.json(result);
}
