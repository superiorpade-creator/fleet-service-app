import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  return NextResponse.json({ ok: true });
}
