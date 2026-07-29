import { NextRequest, NextResponse } from "next/server";
import { buildOverdueDigest } from "@/lib/service-reminder-digest";
import { sendSms, getAlertRecipients } from "@/lib/sms";

// Triggered daily by Vercel Cron (see vercel.json). Vercel automatically
// sends `Authorization: Bearer <CRON_SECRET>` when it invokes a scheduled
// route as long as CRON_SECRET is set in the project's environment
// variables — this check rejects anyone else who finds the URL.
function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed if it isn't configured
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const recipients = getAlertRecipients();
  if (recipients.length === 0) {
    return NextResponse.json({ skipped: "No ALERT_PHONE_NUMBERS configured." });
  }

  const { count, body } = await buildOverdueDigest();
  if (count === 0 || !body) {
    return NextResponse.json({ overdue: 0 });
  }

  const results = await Promise.allSettled(recipients.map((to) => sendSms(to, body)));
  const failures = results.filter((r) => r.status === "rejected");

  return NextResponse.json({
    overdue: count,
    texted: recipients.length - failures.length,
    failed: failures.length,
  });
}
