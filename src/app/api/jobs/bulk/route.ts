import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ImportedUnitRow } from "@/lib/types";

interface BulkJobInput {
  client_name: string;
  scheduled_date?: string | null;
  units: ImportedUnitRow[];
}

interface BulkResult {
  client_name: string;
  ok: boolean;
  job_id?: string;
  job_number?: number;
  error?: string;
}

// Creates many jobs in one request — used by the bulk import screen, where
// an admin uploads several spreadsheets (one per client) at once. Each job
// is created independently so one bad file doesn't block the rest of the
// batch; per-job results come back so the UI can show which ones failed.
export async function POST(request: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Only admins can import jobs" }, { status: 403 });
  }

  const { jobs }: { jobs: BulkJobInput[] } = await request.json();
  if (!Array.isArray(jobs) || jobs.length === 0) {
    return NextResponse.json({ error: "No jobs to create." }, { status: 400 });
  }

  const results: BulkResult[] = [];

  for (const input of jobs) {
    if (!input.client_name?.trim() || !input.units?.length) {
      results.push({ client_name: input.client_name || "(unnamed)", ok: false, error: "Missing client name or units" });
      continue;
    }

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .insert({
        client_name: input.client_name.trim(),
        scheduled_date: input.scheduled_date || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (jobError || !job) {
      results.push({ client_name: input.client_name, ok: false, error: jobError?.message ?? "Couldn't create job" });
      continue;
    }

    const { error: unitsError } = await supabase.from("units").insert(
      input.units.map((u, i) => ({
        job_id: job.id,
        unit_number: u.unit_number,
        location: u.location ?? null,
        unit_type: u.unit_type ?? null,
        sort_order: i,
      }))
    );

    if (unitsError) {
      // Roll back the orphaned job so a failed batch doesn't leave empty work orders behind.
      await supabase.from("jobs").delete().eq("id", job.id);
      results.push({ client_name: input.client_name, ok: false, error: unitsError.message });
      continue;
    }

    results.push({ client_name: input.client_name, ok: true, job_id: job.id, job_number: job.job_number });
  }

  return NextResponse.json({ results });
}
