import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { EditableUnitRow } from "@/lib/types";

// Diff-based update to a job's unit list: existing rows (identified by id)
// are updated in place, new rows (no id) are inserted, and anything
// removed from the submitted list gets deleted. Unlike a full
// delete-and-reinsert, this preserves each unit's serviced/notes state —
// important once a job is already marked complete and an admin is just
// fixing a typo, not re-doing the checklist.
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  const { units }: { units: EditableUnitRow[] } = await request.json();
  if (!Array.isArray(units) || units.length === 0) {
    return NextResponse.json({ error: "At least one unit is required." }, { status: 400 });
  }

  const { data: existing } = await supabase.from("units").select("id").eq("job_id", params.id);
  const existingIds = new Set((existing ?? []).map((u) => u.id as string));
  const submittedIds = new Set(units.filter((u) => u.id).map((u) => u.id as string));

  const idsToDelete = [...existingIds].filter((id) => !submittedIds.has(id));

  const updates = units
    .map((u, i) => ({ ...u, sort_order: i }))
    .filter((u) => u.id && existingIds.has(u.id));
  const inserts = units
    .map((u, i) => ({ ...u, sort_order: i }))
    .filter((u) => !u.id || !existingIds.has(u.id));

  if (idsToDelete.length > 0) {
    const { error } = await supabase.from("units").delete().in("id", idsToDelete);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (updates.length > 0) {
    const results = await Promise.all(
      updates.map((u) =>
        supabase
          .from("units")
          .update({
            unit_number: u.unit_number,
            location: u.location ?? null,
            unit_type: u.unit_type ?? null,
            serviced: u.serviced ?? false,
            sort_order: u.sort_order,
          })
          .eq("id", u.id as string)
      )
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });
  }

  if (inserts.length > 0) {
    const { error } = await supabase.from("units").insert(
      inserts.map((u) => ({
        job_id: params.id,
        unit_number: u.unit_number,
        location: u.location ?? null,
        unit_type: u.unit_type ?? null,
        serviced: u.serviced ?? false,
        sort_order: u.sort_order,
      }))
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
