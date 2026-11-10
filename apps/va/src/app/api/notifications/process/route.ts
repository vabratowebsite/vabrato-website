import { NextResponse } from "next/server";
import {
  createServiceSupabase,
  processDueNotifications,
  resendSender,
  supabaseNotificationDeps,
} from "@vabrato/lib";

// Sender for scheduled seller notifications and buyer alert emails: POST with
// `Authorization: Bearer $CRON_SECRET`. The MLS sync job on Render calls it
// right after each run (packages/mls/RENDER.md). PUBLIC_SITE_URL sets the
// links in emails (default https://vabrato.com).
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFICATIONS_FROM ?? "Vabrato <notifications@vabrato.com>";
  if (!apiKey) {
    // DNS/Resend not set up yet — leave rows scheduled, report clearly.
    return NextResponse.json(
      { error: "RESEND_API_KEY not configured; notifications remain scheduled" },
      { status: 503 },
    );
  }

  const service = createServiceSupabase();
  const result = await processDueNotifications(
    supabaseNotificationDeps(service, resendSender(apiKey, from), 50, process.env.PUBLIC_SITE_URL ?? "https://vabrato.com"),
  );
  return NextResponse.json(result);
}
