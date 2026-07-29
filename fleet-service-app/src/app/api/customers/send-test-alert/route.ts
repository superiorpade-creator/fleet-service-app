import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildOverdueDigest } from "@/lib/service-reminder-digest";
import { sendSms, getAlertRecipients } from "@/lib/sms";

export async function POST(_request: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  const recipients = getAlertRecipients();
  if (recipients.length === 0) {
    return NextResponse.json(
      { error: "No ALERT_PHONE_NUMBERS configured — set it in your environment variables." },
      { status: 400 }
    );
  }

  const { count, body } = await buildOverdueDigest();
  const messageBody = body ?? "Fleet Ops test: no accounts are currently overdue for service.";

  try {
    await Promise.all(recipients.map((to) => sendSms(to, messageBody)));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't send the text.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, overdue: count, texted: recipients.length });
}
