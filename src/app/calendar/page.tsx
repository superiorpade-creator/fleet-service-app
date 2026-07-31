import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/Navbar";
import { CalendarGrid } from "@/components/CalendarGrid";
import { ServiceReminders } from "@/components/ServiceReminders";
import { buildCustomerStatusList } from "@/lib/service-status";
import { startOfMonth, endOfMonth, format, parse } from "date-fns";
import type { Customer, Job } from "@/lib/types";

export const dynamic = "force-dynamic";export default async function CalendarPage({
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
  const monthStart = format(startOfMonth(monthDate), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(monthDate), "yyyy-MM-dd");

  // These two are independent of each other, so run them at the same time
  // instead of one after another - this is what was making month
  // navigation feel slow (or time out entirely): every click was paying
  // for several database round trips in a row instead of in parallel.
  const [jobsResult, remindersData] = await Promise.all([
    supabase
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
  ]);

  const jobs = jobsResult.data;

  // Service reminders are an admin-only concern - crew don't need to see
  // which accounts are overdue for scheduling.
  let reminderCustomers: ReturnType<typeof buildCustomerStatusList> = [];
  if (isAdmin && remindersData) {
    const [customersResult, allJobsResult] = remindersData;
    reminderCustomers = buildCustomerStatusList((customersResult.data as Customer[]) ?? [], allJobsResult.data ?? []);
  }

  return (
    <>
      <Navbar role={profile?.role ?? "crew"} />
      {isAdmin && <ServiceReminders customers={reminderCustomers} />}
      <CalendarGrid monthDate={monthDate} jobs={(jobs as Job[]) ?? []} />
    </>
  );
}
