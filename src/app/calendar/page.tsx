import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/Navbar";
import { CalendarMonthNav } from "@/components/CalendarMonthNav";
import { CalendarGrid } from "@/components/CalendarGrid";
import { ServiceReminders } from "@/components/ServiceReminders";
import { buildCustomerStatusList } from "@/lib/service-status";
import { startOfMonth, endOfMonth, format } from "date-fns";
import type { Customer, Job, Profile } from "@/lib/types";
export const dynamic = "force-dynamic";
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single();
  const isAdmin = profile?.role === "admin";
  const [y, m] = (searchParams.month || format(new Date(), "yyyy-MM")).split("-").map(Number);
  const monthDate = new Date(Date.UTC(y, m - 1, 1, 12, 0, 0));
  const monthStart = format(startOfMonth(monthDate), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(monthDate), "yyyy-MM-dd");

  if (!isAdmin) {
    // Crew only ever see their own assigned jobs.
    const { data: links } = await supabase.from("job_crew").select("job_id").eq("profile_id", user!.id);
    const jobIds = (links ?? []).map((l) => l.job_id);
    const { data: jobs } =
      jobIds.length > 0
        ? await supabase
            .from("jobs")
            .select("*")
            .gte("scheduled_date", monthStart)
            .lte("scheduled_date", monthEnd)
            .in("id", jobIds)
        : { data: [] as Job[] };

    return (
      <>
        <Navbar role="crew" />
        <CalendarMonthNav monthDate={monthDate} />
        <div className="pb-24">
          <CalendarGrid monthDate={monthDate} jobs={(jobs as Job[]) ?? []} />
        </div>
      </>
    );
  }

  // Admin: fetch this month's jobs once, plus every crew assignment for
  // those specific jobs, then group in memory - one round trip each,
  // rather than a separate query per crew member.
  const [jobsResult, crewListResult, remindersData] = await Promise.all([
    supabase.from("jobs").select("*").gte("scheduled_date", monthStart).lte("scheduled_date", monthEnd),
    supabase.from("profiles").select("*").eq("role", "crew").order("full_name"),
    Promise.all([
      supabase.from("customers").select("id, name, contact_name, phone, email, address, frequency, notes, created_at"),
      supabase.from("jobs").select("customer_id, status, completed_at, scheduled_date").not("customer_id", "is", null),
    ]),
  ]);

  const allJobs = (jobsResult.data as Job[]) ?? [];
  const crewList = (crewListResult.data as Profile[]) ?? [];
  const jobIds = allJobs.map((j) => j.id);

  const { data: crewLinks } =
    jobIds.length > 0 ? await supabase.from("job_crew").select("job_id, profile_id").in("job_id", jobIds) : { data: [] };

  const jobsById = new Map(allJobs.map((j) => [j.id, j]));
  const jobsByCrew = new Map<string, Job[]>();
  for (const link of crewLinks ?? []) {
    const job = jobsById.get(link.job_id);
    if (!job) continue;
    const list = jobsByCrew.get(link.profile_id) ?? [];
    list.push(job);
    jobsByCrew.set(link.profile_id, list);
  }

  const [customersResult, allJobsForRemindersResult] = remindersData;
  const reminderCustomers = buildCustomerStatusList(
    (customersResult.data as Customer[]) ?? [],
    allJobsForRemindersResult.data ?? []
  );

  return (
    <>
      <Navbar role="admin" />
      <ServiceReminders customers={reminderCustomers} />
      <CalendarMonthNav monthDate={monthDate} />
      <div className="flex flex-col gap-8 pb-24">
        <CalendarGrid monthDate={monthDate} jobs={allJobs} label="All Crew" draggable />
        {crewList.map((c) => (
          <CalendarGrid key={c.id} monthDate={monthDate} jobs={jobsByCrew.get(c.id) ?? []} label={c.full_name} draggable />
        ))}
      </div>
    </>
  );
}
