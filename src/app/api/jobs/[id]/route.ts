import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendSms } from "@/lib/sms";
async function requireAdmin(supabase: ReturnType<typeof createClient>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, error: "Not signed in" };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { ok: false as const, status: 403, error: "Admins only" };
  return { ok: true as const, userId: user.id };
}
// PATCH: edit job fields, reassign crew, or reopen a completed job. Also
// texts crew when it's relevant to them - newly-assigned crew get a
// "you're on this job" text, and everyone currently assigned gets texted
// if the scheduled date actually changes (the rain/snow-day reschedule
// case) - but re-saving the same job with nothing crew-relevant changed
// stays silent, so admins aren't spamming crew on every small edit.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const auth = await requireAdmin(supabase);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data: existingJob } = await supabase
    .from("jobs")
    .select("client_name, scheduled_date")
    .eq("id", params.id)
    .single();
  const { data: existingCrewLinks } = await supabase.from("job_crew").select("profile_id").eq("job_id", params.id);
  const oldCrewIds = (existingCrewLinks ?? []).map((l) => l.profile_id);

  const body = await request.json();
  const updates: Record<string, unknown> = {};
  if (body.client_name !== undefined) updates.client_name = body.client_name;
  if (body.customer_id !== undefined) updates.customer_id = body.customer_id;
  if (body.scheduled_date !== undefined) updates.scheduled_date = body.scheduled_date;
  if (body.notes !== undefined) updates.notes = body.notes;
  // Reopening clears completion state so the crew can correct and re-close.
  if (body.reopen === true) {
    updates.status = "in_progress";
    updates.completed_at = null;
    updates.pdf_url = null;
  }
  if (Object.keys(updates).length > 0) {
    const { error } = await supabase.from("jobs").update(updates).eq("id", params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (Array.isArray(body.crew_ids)) {
    const { error: deleteError } = await supabase.from("job_crew").delete().eq("job_id", params.id);
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
    if (body.crew_ids.length) {
      const { error: crewError } = await supabase
        .from("job_crew")
        .insert(body.crew_ids.map((profile_id: string) => ({ job_id: params.id, profile_id })));
      if (crewError) return NextResponse.json({ error: crewError.message }, { status: 500 });
    }
  }

  // Text crew where relevant - fire-and-forget, never blocks the response.
  const clientName = (body.client_name ?? existingJob?.client_name) as string | undefined;
  const newScheduledDate = body.scheduled_date !== undefined ? body.scheduled_date : existingJob?.scheduled_date;
  const dateChanged = body.scheduled_date !== undefined && body.scheduled_date !== existingJob?.scheduled_date;
  const currentCrewIds: string[] = Array.isArray(body.crew_ids) ? body.crew_ids : oldCrewIds;
  const addedCrewIds = currentCrewIds.filter((id) => !oldCrewIds.includes(id));
  const dateText = newScheduledDate ? ` on ${newScheduledDate}` : "";

  const idsToNotify = new Set<string>();
  addedCrewIds.forEach((id) => idsToNotify.add(id));
  if (dateChanged) currentCrewIds.forEach((id) => idsToNotify.add(id));

  if (idsToNotify.size > 0 && clientName) {
    const { data: crewProfiles } = await supabase
      .from("profiles")
      .select("id, phone")
      .in("id", Array.from(idsToNotify));
    const phoneById = new Map((crewProfiles ?? []).map((p) => [p.id, p.phone]));
    const sends: Promise<void>[] = [];
    for (const id of idsToNotify) {
      const phone = phoneById.get(id);
      if (!phone) continue;
      const isNew = addedCrewIds.includes(id);
      const message = isNew
        ? `You've been scheduled for ${clientName}${dateText}.`
        : `${clientName}'s date has changed to ${newScheduledDate}.`;
      sends.push(sendSms(phone, message).catch(() => {}));
    }
    Promise.all(sends).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
// DELETE: remove a job entirely (admin only, e.g. scheduled by mistake).
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const auth = await requireAdmin(supabase);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { error } = await supabase.from("jobs").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
