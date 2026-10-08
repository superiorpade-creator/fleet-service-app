// Moving the Bentkey stops onto the Revenue calendar.
import { addDaysISO, mondayOf } from "@/lib/bentkey";

export interface StopRow {
  name: string;
  amount: number;
  every_weeks: number;
  next_due: string; // YYYY-MM-DD
}

// Calendar names that would collide with an existing "core" account of the same name.
const CALENDAR_NAME: Record<string, string> = {
  Frankel: "Frankel (Bentkey)",
  MTA: "MTA (Bentkey)",
  Novich: "Novich (Bentkey)",
  "Taylor Farm": "Taylor Farm (Bentkey)",
};
export function calendarName(name: string): string {
  return CALENDAR_NAME[name] ?? name;
}

// The names the old calendar used for these accounts. Entries under these names are
// replaced; "core" copies, Bentkey Mark IV and Unlabeled are left alone.
export const OLD_BENTKEY_NAMES = [
  "ITU", "Packer Av", "Dry Ice", "TA Strat", "Amycel", "Mushroom", "Tri State", "Katzman", "Wellington", "Crw",
  "Frankel (Bentkey)", "MTA (Bentkey)", "Novich (Bentkey)", "Vena", "Produce Ryeco", "USA", "Steel", "Days Bev",
  "DNF", "Phillys Best", "Scrub Daddy", "Taylor Farm (Bentkey)", "Cooseman", "Samuel", "North East",
];

// A week whose stops are all still on its Monday (the list's starting point) gets spread
// over Monday to Friday so each day carries about the same dollars. A week where you
// already picked days is left exactly as you set it.
export function scatterDays(stops: StopRow[]): StopRow[] {
  const byWeek = new Map<string, StopRow[]>();
  for (const s of stops) {
    const w = mondayOf(s.next_due);
    byWeek.set(w, [...(byWeek.get(w) ?? []), s]);
  }
  const out: StopRow[] = [];
  for (const [w, group] of Array.from(byWeek.entries())) {
    if (!group.every((s) => s.next_due === w)) {
      out.push(...group);
      continue;
    }
    const load = [0, 0, 0, 0, 0];
    const ordered = [...group].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
    for (const s of ordered) {
      let d = 0;
      for (let k = 1; k < 5; k++) if (load[k] < load[d]) d = k;
      load[d] += s.amount;
      out.push({ ...s, next_due: addDaysISO(w, d) });
    }
  }
  return out;
}

// One calendar visit for every cycle from a stop's first due date through the end date.
export function expandStops(stops: StopRow[], through: string) {
  const rows: { name: string; amount: number; scheduled_date: string; series_id: string }[] = [];
  for (const s of stops) {
    let d = s.next_due;
    for (let n = 0; d <= through && n < 60; n++) {
      rows.push({ name: calendarName(s.name), amount: s.amount, scheduled_date: d, series_id: "bk::" + s.name });
      d = addDaysISO(d, s.every_weeks * 7);
    }
  }
  return rows;
}
