// Bentkey stops: one weekly work order, with each account as a checklist item.
// A stop that gets checked off rolls forward; one that doesn't stays due and
// carries into the next week's work order.

export interface Stop {
  id: string;
  name: string;
  amount: number;
  every_weeks: number;
  next_due: string; // YYYY-MM-DD
  last_serviced: string | null;
  active: boolean;
}

export function addDaysISO(s: string, days: number): string {
  const d = new Date(s + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function mondayOf(s: string): string {
  const d = new Date(s + "T00:00:00Z");
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return d.toISOString().slice(0, 10);
}

// After a stop is serviced, its next due date keeps the rotation (one cycle
// after the date it was due). If that is already in the past - the stop was
// weeks late - the cycle restarts from the day it was actually serviced.
export function nextDueAfterService(nextDue: string, everyWeeks: number, servicedOn: string): string {
  const candidate = addDaysISO(nextDue, everyWeeks * 7);
  return candidate > servicedOn ? candidate : addDaysISO(servicedOn, everyWeeks * 7);
}

// Stops that belong on a week's work order: due that week, or overdue from before it.
export function stopsForWeek(stops: Stop[], weekStart: string): { stop: Stop; overdue: boolean }[] {
  const end = addDaysISO(weekStart, 6);
  return stops
    .filter((s) => s.active && s.next_due <= end)
    .map((s) => ({ stop: s, overdue: s.next_due < weekStart }))
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.stop.name.localeCompare(b.stop.name));
}

// Spreads stops across n weekly groups so each group carries about the same dollars.
export function splitIntoGroups(amounts: number[], n: number): number[] {
  const order = amounts.map((a, i) => i).sort((a, b) => amounts[b] - amounts[a] || a - b);
  const totals = new Array(n).fill(0);
  const out = new Array(amounts.length).fill(0);
  for (const i of order) {
    let g = 0;
    for (let k = 1; k < n; k++) if (totals[k] < totals[g]) g = k;
    out[i] = g;
    totals[g] += amounts[i];
  }
  return out;
}

// Called when a Bentkey work order is closed: stops that were checked off roll
// forward; unchecked ones are left alone, so they stay due.
export async function advanceBentkeyStops(admin: any, jobId: string): Promise<number> {
  const { data: job } = await admin.from("jobs").select("bentkey_week").eq("id", jobId).single();
  if (!job || !job.bentkey_week) return 0;
  const weekEnd = addDaysISO(job.bentkey_week, 6);

  const { data: units } = await admin
    .from("units")
    .select("bentkey_stop_id, serviced")
    .eq("job_id", jobId)
    .not("bentkey_stop_id", "is", null);
  const doneIds: string[] = (units ?? []).filter((u: any) => u.serviced).map((u: any) => u.bentkey_stop_id);
  if (doneIds.length === 0) return 0;

  const { data: stops } = await admin.from("bentkey_stops").select("id, every_weeks, next_due").in("id", doneIds);
  const today = new Date().toISOString().slice(0, 10);
  let advanced = 0;
  for (const s of stops ?? []) {
    if (s.next_due > weekEnd) continue; // already rolled forward by an earlier close
    const next = nextDueAfterService(s.next_due, s.every_weeks, today);
    const { error } = await admin.from("bentkey_stops").update({ next_due: next, last_serviced: today }).eq("id", s.id);
    if (!error) advanced += 1;
  }
  return advanced;
}
