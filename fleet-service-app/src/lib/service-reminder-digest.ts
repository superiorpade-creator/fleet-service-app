import { createServiceRoleClient } from "./supabase/server";
import { buildCustomerStatusList } from "./service-status";
import type { Customer } from "./types";

/**
 * Builds the "N accounts overdue" digest text from current customer/job
 * data. Shared by the daily cron route and the admin's manual test-send
 * button so both produce identical output. Server-only (uses the service
 * role client) — never import this into a client component.
 */
export async function buildOverdueDigest(): Promise<{ count: number; body: string | null }> {
  const supabase = createServiceRoleClient();

  const { data: customers } = await supabase.from("customers").select("*");
  const { data: jobs } = await supabase.from("jobs").select("customer_id, status, completed_at, scheduled_date");

  const statuses = buildCustomerStatusList((customers as Customer[]) ?? [], jobs ?? []);
  const overdue = statuses.filter((c) => c.status === "overdue").sort((a, b) => b.days_overdue - a.days_overdue);

  if (overdue.length === 0) return { count: 0, body: null };

  const lines = overdue.slice(0, 15).map((c) => `• ${c.name} — ${c.days_overdue}d overdue`);
  const more = overdue.length > 15 ? `\n…and ${overdue.length - 15} more` : "";
  const body = `Fleet Ops: ${overdue.length} account${overdue.length === 1 ? "" : "s"} overdue for service\n${lines.join("\n")}${more}`;

  return { count: overdue.length, body };
}
