import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/Navbar";
import { CalendarGrid } from "@/components/CalendarGrid";
import { ServiceReminders } from "@/components/ServiceReminders";
import { buildCustomerStatusList } from "@/lib/service-status";
import { startOfMonth, endOfMonth, format, parse } from "date-fns";
import type { Customer, Job } from "@/lib/types";

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

  const monthDate = searchParams.month ? parse(searchParams.month, "yyyy-MM", new Date()) : new Date();

  // RLS scopes this automatically: admins see every job, crew see only
  // jobs they're assigned to (see job_crew policies in supabase/schema.sql).
  const { data: jobs } = await supabase
    .from("jobs")
    .select("*")
    .gte("scheduled_date", format(startOfMonth(monthDate), "yyyy-MM-dd"))
    .lte("scheduled_date", format(endOfMonth(monthDate), "yyyy-MM-dd"));

  // Service reminders are an admin-only concern — crew don't need to see
  // which accounts are overdue for scheduling.
  let reminderCustomers: ReturnType<typeof buildCustomerStatusList> = [];
  if (isAdmin) {
    const { data: customers } = await supabase.from("customers").select("*");
    const { data: allJobs } = await supabase.from("jobs").select("customer_id, status, completed_at, scheduled_date");
    reminderCustomers = buildCustomerStatusList((customers as Customer[]) ?? [], allJobs ?? []);
  }

  return (
    <>
      <Navbar role={profile?.role ?? "crew"} />
      {isAdmin && <ServiceReminders customers={reminderCustomers} />}
      <CalendarGrid monthDate={monthDate} jobs={(jobs as Job[]) ?? []} />
    </>
  );
}
