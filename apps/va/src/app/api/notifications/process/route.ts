import { NextResponse } from "next/server";
import {
  createServiceSupabase,
  processDueNotifications,
  resendSender,
  supabaseNotificationDeps,
} from "@vabrato/lib";

// Cron-callable sender: POST with `Authorization: Bearer $CRON_SECRET`.
// Wire a Vercel cron (e.g. every 15 min) to this route once deployed.
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
    supabaseNotificationDeps(service, resendSender(apiKey, from)),
  );
  return NextResponse.json(result);
}
