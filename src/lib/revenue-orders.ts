// Pure helpers for turning a week of revenue visits into work orders.

export interface RevenueVisit {
  id: string;
  name: string;
  scheduled_date: string;
  job_id: string | null;
}

export interface VisitChoice {
  revenue_id: string;
  customer_id: string | null;
}

export interface PlannedOrder {
  revenue_id: string;
  client_name: string;
  customer_id: string | null;
  scheduled_date: string;
}

export interface CustomerUnitRow {
  customer_id: string;
  unit_number: string;
  location: string | null;
  unit_type: string | null;
  sort_order: number | null;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Best guess at which customer a revenue account name refers to. Only
 * returns an id when exactly one customer fits, so "Ryder" (which could be
 * several Ryder sites) is left for the admin to pick instead of guessed.
 */
export function guessCustomerId(accountName: string, customers: { id: string; name: string }[]): string | null {
  const a = norm(accountName);
  if (!a) return null;
  const normed = customers.map((c) => ({ id: c.id, n: norm(c.name) }));
  const exact = normed.filter((c) => c.n === a);
  if (exact.length === 1) return exact[0].id;
  const starts = normed.filter((c) => c.n.startsWith(a + " "));
  if (starts.length === 1) return starts[0].id;
  const contains = normed.filter((c) => c.n.includes(a));
  if (contains.length === 1) return contains[0].id;
  return null;
}

/** Visits that don't have a work order yet, in date order, ready to insert. */
export function planWorkOrders(
  visits: RevenueVisit[],
  choices: VisitChoice[],
  customerNames: Map<string, string>
): PlannedOrder[] {
  const choiceById = new Map(choices.map((c) => [c.revenue_id, c.customer_id]));
  return visits
    .filter((v) => !v.job_id && choiceById.has(v.id))
    .sort((a, b) => (a.scheduled_date + "|" + a.name).localeCompare(b.scheduled_date + "|" + b.name))
    .map((v) => {
      const cid = choiceById.get(v.id) ?? null;
      const known = cid !== null && customerNames.has(cid);
      return {
        revenue_id: v.id,
        client_name: known ? (customerNames.get(cid as string) as string) : v.name,
        customer_id: known ? cid : null,
        scheduled_date: v.scheduled_date,
      };
    });
}

/** The customer's saved unit list, copied onto a new work order. */
export function buildUnitRows(
  jobId: string,
  customerId: string | null,
  unitsByCustomer: Map<string, CustomerUnitRow[]>
) {
  if (!customerId) return [];
  const units = [...(unitsByCustomer.get(customerId) ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  return units.map((u, i) => ({
    job_id: jobId,
    unit_number: u.unit_number,
    location: u.location,
    unit_type: u.unit_type,
    sort_order: i,
  }));
}
