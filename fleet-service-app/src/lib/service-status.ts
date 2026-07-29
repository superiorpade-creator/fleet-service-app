import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import type { Customer, CustomerFrequency, CustomerWithStatus, Job, ServiceStatus } from "./types";

export const FREQUENCY_DAYS: Record<CustomerFrequency, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
};

export const FREQUENCY_LABEL: Record<CustomerFrequency, string> = {
  weekly: "Weekly",
  biweekly: "Bi-Weekly",
  monthly: "Monthly",
};

/**
 * Given a customer's frequency and the date they were last serviced,
 * figures out whether they're on track, due soon, or overdue for their
 * next visit. A customer with an upcoming (scheduled/in-progress) job
 * already on the calendar is always "on track" even past their nominal
 * due date — the point of the reminder is to catch accounts that fell
 * through the cracks, not ones that are simply scheduled a bit late.
 */
export function computeServiceStatus({
  frequency,
  lastServiceDate,
  hasUpcomingJob,
  today = new Date(),
}: {
  frequency: CustomerFrequency;
  lastServiceDate: string | null; // ISO date of the most recent completed job
  hasUpcomingJob: boolean;
  today?: Date;
}): { status: ServiceStatus; nextDueDate: string | null; daysOverdue: number } {
  if (!lastServiceDate) {
    // Never serviced yet — not "overdue" in the usual sense, just flagged
    // separately so a brand-new customer doesn't look alarming on day one.
    return { status: "no_history", nextDueDate: null, daysOverdue: 0 };
  }

  const dueDate = addDays(parseISO(lastServiceDate), FREQUENCY_DAYS[frequency]);
  const nextDueDate = format(dueDate, "yyyy-MM-dd");

  if (hasUpcomingJob) {
    return { status: "on_track", nextDueDate, daysOverdue: 0 };
  }

  const daysUntilDue = differenceInCalendarDays(dueDate, today);

  if (daysUntilDue < 0) {
    return { status: "overdue", nextDueDate, daysOverdue: -daysUntilDue };
  }
  if (daysUntilDue <= 2) {
    return { status: "due_soon", nextDueDate, daysOverdue: 0 };
  }
  return { status: "on_track", nextDueDate, daysOverdue: 0 };
}

type JobForStatus = Pick<Job, "customer_id" | "status" | "completed_at" | "scheduled_date">;

/**
 * Combines every customer with their job history into a list of
 * CustomerWithStatus, ready for the Customers screen and the dispatch
 * reminders banner. Pure function — takes plain data, does no fetching —
 * so it's easy to reuse from any server component.
 */
export function buildCustomerStatusList(customers: Customer[], jobs: JobForStatus[]): CustomerWithStatus[] {
  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");

  return customers.map((customer) => {
    const customerJobs = jobs.filter((j) => j.customer_id === customer.id);

    const completedDates = customerJobs
      .filter((j) => j.status === "completed" && j.completed_at)
      .map((j) => format(parseISO(j.completed_at as string), "yyyy-MM-dd"))
      .sort();
    const lastServiceDate = completedDates.length ? completedDates[completedDates.length - 1] : null;

    const hasUpcomingJob = customerJobs.some(
      (j) =>
        j.status !== "completed" &&
        ((j.scheduled_date && j.scheduled_date >= todayStr) || j.status === "in_progress")
    );

    const { status, nextDueDate, daysOverdue } = computeServiceStatus({
      frequency: customer.frequency,
      lastServiceDate,
      hasUpcomingJob,
      today,
    });

    return { ...customer, last_service_date: lastServiceDate, next_due_date: nextDueDate, status, days_overdue: daysOverdue };
  });
}
