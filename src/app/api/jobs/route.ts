import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ImportedUnitRow } from "@/lib/types";

interface CreateJobBody {
  client_name: string;
  customer_id?: string | null;
  scheduled_date?: string | null;
  crew_ids: string[];
  units: ImportedUnitRow[];
  notes?: string;
}

export async function POST(request: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Only admins can create jobs" }, { status: 403 });
  }

  const body: CreateJobBody = await request.json();

  if (!body.client_name?.trim()) {
    return NextResponse.json({ error: "Client name is required." }, { status: 400 });
  }

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({
      client_name: body.client_name.trim(),
      customer_id: body.customer_id || null,
      scheduled_date: body.scheduled_date || null,
      notes: body.notes ?? null,
      created_by: user.id,
    })
    .select()
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: jobError?.message ?? "Couldn't create job" }, { status: 500 });
  }

  if (body.crew_ids?.length) {
    await supabase.from("job_crew").insert(body.crew_ids.map((profile_id) => ({ job_id: job.id, profile_id })));
  }

  if (body.units?.length) {
    const unitRows = body.units.map((u, i) => ({
      job_id: job.id,
      unit_number: u.unit_number,
      location: u.location ?? null,
      unit_type: u.unit_type ?? null,
      sort_order: i,
    }));

    const { error: unitsError } = await supabase.from("units").insert(unitRows);
    if (unitsError) {
      return NextResponse.json({ error: unitsError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ job }, { status: 201 });
}
