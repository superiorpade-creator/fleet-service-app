import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Unit } from "@/lib/types";

// Crew-facing close-out: marks the work order complete once every unit is
// checked off. Deliberately does NOT generate the PDF — that happens
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

  const { data: units } = await supabase.from("units").select("*").eq("job_id", params.id);

  const unservicedCount = (units as Unit[] | null)?.filter((u) => !u.serviced).length ?? 0;
  if (unservicedCount > 0) {
    return NextResponse.json(
      { error: `${unservicedCount} unit(s) still need to be checked off before completing.` },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("jobs")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
