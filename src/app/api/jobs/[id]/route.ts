import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function requireAdmin(supabase: ReturnType<typeof createClient>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, error: "Not signed in" };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { ok: false as const, status: 403, error: "Admins only" };

  return { ok: true as const, userId: user.id };
}

// PATCH: edit job fields, reassign crew, or reopen a completed job.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const auth = await requireAdmin(supabase);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

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
    await supabase.from("job_crew").delete().eq("job_id", params.id);
    if (body.crew_ids.length) {
      await supabase
        .from("job_crew")
        .insert(body.crew_ids.map((profile_id: string) => ({ job_id: params.id, profile_id })));
    }
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
