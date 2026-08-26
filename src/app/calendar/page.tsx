import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/Navbar";
import { CalendarGrid } from "@/components/CalendarGrid";
import { ServiceReminders } from "@/components/ServiceReminders";
import { buildCustomerStatusList } from "@/lib/service-status";
import { startOfMonth, endOfMonth, format } from "date-fns";
import type { Customer, Job, Profile } from "@/lib/types";
export const dynamic = "force-dynamic";
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: { month?: string; crew?: string };
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

  // Crew only ever see their own assigned jobs - never the whole
  // company's schedule. Admins see everything by default, but can narrow
  // to one crew member at a time via ?crew=<id> (the CrewFilter dropdown).
  const crewFilterId = isAdmin ? searchParams.crew || null : user!.id;

  let jobIdsForCrew: string[] | null = null;
  if (crewFilterId) {
    const { data: links } = await supabase.from("job_crew").select("job_id").eq("profile_id", crewFilterId);
    jobIdsForCrew = (links ?? []).map((l) => l.job_id);
  }

  const [jobsResult, remindersData, crewListResult] = await Promise.all([
    crewFilterId
      ? jobIdsForCrew && jobIdsForCrew.length > 0
        ? supabase
            .from("jobs")
            .select("*")
            .gte("scheduled_date", monthStart)
            .lte("scheduled_date", monthEnd)
            .in("id", jobIdsForCrew)
        : Promise.resolve({ data: [] as Job[] })
      : supabase
          .from("jobs")
          .select("*")
          .gte("scheduled_date", monthStart)
          .lte("scheduled_date", monthEnd),
    isAdmin
      ? Promise.all([
          supabase.from("customers").select("id, name, contact_name, phone, email, address, frequency, notes, created_at"),
          supabase
            .from("jobs")
            .select("customer_id, status, completed_at, scheduled_date")
            .not("customer_id", "is", null),
        ])
      : Promise.resolve(null),
    isAdmin ? supabase.from("profiles").select("*").eq("role", "crew").order("full_name") : Promise.resolve(null),
  ]);
  const jobs = jobsResult.data;
  const crewList = (crewListResult?.data as Profile[]) ?? [];

  let reminderCustomers: ReturnType<typeof buildCustomerStatusList> = [];
  if (isAdmin && remindersData) {
    const [customersResult, allJobsResult] = remindersData;
    reminderCustomers = buildCustomerStatusList((customersResult.data as Customer[]) ?? [], allJobsResult.data ?? []);
  }
  return (
    <>
      <Navbar role={profile?.role ?? "crew"} />
      {isAdmin && <ServiceReminders customers={reminderCustomers} />}
      <CalendarGrid
        monthDate={monthDate}
        jobs={(jobs as Job[]) ?? []}
        isAdmin={isAdmin}
        crewList={crewList}
        selectedCrewId={searchParams.crew ?? null}
      />
    </>
  );
}
