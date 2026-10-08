import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { sendSms, getAlertRecipients } from "@/lib/sms";
import { formatWorkOrderNumber } from "@/lib/format";

// When a job closes, any truck on it that isn't already in the customer's
// saved list gets added, so the next job for that customer auto-fills with
// it. Skipped for customers with no saved list (rotating fleets).
async function addNewUnitsToCustomerList(jobId: string, customerId: string) {
  const admin = createServiceRoleClient();
  const { data: saved } = await admin
    .from("customer_units")
    .select("unit_number, unit_type, sort_order")
    .eq("customer_id", customerId);
  if (!saved || saved.length === 0) return;

  const known = new Set<string>(saved.map((u: any) => String(u.unit_number).trim().toLowerCase()));
  let nextOrder = Math.max(...saved.map((u: any) => u.sort_order ?? 0)) + 1;
  const savedTypes = Array.from(new Set<string>(saved.map((u: any) => (u.unit_type ?? "").trim()).filter(Boolean)));
  const defaultType = savedTypes.length === 1 ? savedTypes[0] : null;

  const { data: jobUnits } = await admin
    .from("units")
    .select("unit_number, location, unit_type")
    .eq("job_id", jobId)
    .eq("serviced", true)
    .order("sort_order");

  const rows: any[] = [];
  for (const u of jobUnits ?? []) {
    const num = String(u.unit_number).trim();
    const key = num.toLowerCase();
    if (!num || known.has(key)) continue;
    known.add(key);
    rows.push({
      customer_id: customerId,
      unit_number: num,
      location: u.location ?? null,
      unit_type: u.unit_type ?? defaultType,
      sort_order: nextOrder++,
    });
  }
  if (rows.length > 0) await admin.from("customer_units").insert(rows);
}

// Crew-facing close-out: marks the work order complete whenever crew are
// ready - units left unchecked are fine, they just show unchecked on the
// record. Deliberately does NOT generate the PDF - that happens
// separately once an admin has had a chance to review/correct the work
// order (see /api/jobs/[id]/generate-pdf).
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: job } = await supabase.from("jobs").select("*").eq("id", params.id).single();
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (job.status === "completed") {
    return NextResponse.json({ error: "This work order is already marked complete." }, { status: 409 });
  }
  const { error } = await supabase
    .from("jobs")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Never let this block the close-out itself.
  if (job.customer_id) {
    try {
      await addNewUnitsToCustomerList(params.id, job.customer_id);
    } catch {}
  }

  // Text the admin alert numbers now that it's actually saved - a text
  // send failing (bad number, Twilio hiccup) should never block the
  // close-out itself, so this is fire-and-forget with its own catch.
  const recipients = getAlertRecipients();
  if (recipients.length > 0) {
    const woLabel = job.job_number ? formatWorkOrderNumber(job.job_number) : "a job";
    const message = `${woLabel} for ${job.client_name} marked complete.`;
    Promise.all(recipients.map((to) => sendSms(to, message).catch(() => {}))).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
