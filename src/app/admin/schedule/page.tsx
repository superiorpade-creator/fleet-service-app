import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/Navbar";
import { DispatchBoard } from "@/components/DispatchBoard";
import { startOfWeek, endOfWeek, format, parse } from "date-fns";
import type { BoardJob, Profile } from "@/lib/types";

export default async function SchedulePage({ searchParams }: { searchParams: { week?: string } }) {
  const supabase = createClient();

  const anchorDate = searchParams.week ? parse(searchParams.week, "yyyy-MM-dd", new Date()) : new Date();
  const weekStart = startOfWeek(anchorDate);
  const weekEnd = endOfWeek(anchorDate);

  const { data: technicians } = await supabase
    .from("profiles")
    .select("*")
    .eq("role", "crew")
    .order("full_name");

  // Pull every open job with its assigned technician ids and a unit count.
  // Unassigned work orders (no crew yet) show in the tray regardless of
  // date; everything else is placed on the grid if its date falls in the
  // visible week. See README for a note on scaling this query.
  const { data: jobsRaw } = await supabase
    .from("jobs")
    .select("id, job_number, client_name, scheduled_date, status, job_crew(profile_id), units(count)")
    .neq("status", "completed")
    .order("client_name");

  const jobs: BoardJob[] = (jobsRaw ?? []).map((j: any) => ({
    id: j.id,
    job_number: j.job_number,
    client_name: j.client_name,
    scheduled_date: j.scheduled_date,
    status: j.status,
    crew_ids: (j.job_crew ?? []).map((c: any) => c.profile_id),
    unit_count: j.units?.[0]?.count ?? 0,
  }));

  const unassignedJobs = jobs.filter((j) => j.crew_ids.length === 0);
  const gridJobs = jobs.filter(
    (j) =>
      j.crew_ids.length > 0 &&
      j.scheduled_date &&
      j.scheduled_date >= format(weekStart, "yyyy-MM-dd") &&
      j.scheduled_date <= format(weekEnd, "yyyy-MM-dd")
  );

  return (
    <>
      <Navbar role="admin" />
      <DispatchBoard
        weekStart={format(weekStart, "yyyy-MM-dd")}
        technicians={(technicians as Profile[]) ?? []}
        unassignedJobs={unassignedJobs}
        gridJobs={gridJobs}
      />
    </>
  );
}
