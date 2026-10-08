import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { expandStops, OLD_BENTKEY_NAMES, scatterDays, type StopRow } from "@/lib/bentkey-calendar";

async function requireAdmin(supabase: ReturnType<typeof createClient>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, error: "Not signed in" };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { ok: false as const, status: 403, error: "Admins only" };
  return { ok: true as const };
}

// POST: move the Bentkey stops onto the revenue calendar. Safe to run again - if the
// calendar already has them, it only finishes the clean-up.
export async function POST(_request: NextRequest) {
  const supabase = createClient();
  const auth = await requireAdmin(supabase);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data: stopRows, error: stopsError } = await supabase
    .from("bentkey_stops")
    .select("id, name, amount, every_weeks, next_due")
    .eq("active", true);
  if (stopsError) return NextResponse.json({ error: stopsError.message }, { status: 500 });
  const stops: StopRow[] = (stopRows ?? []).map((r: any) => ({
    name: r.name,
    amount: Number(r.amount),
    every_weeks: Number(r.every_weeks),
    next_due: r.next_due,
  }));

  const { data: existing } = await supabase.from("revenue_accounts").select("scheduled_date").like("series_id", "bk::%");
  let inserted = 0;
  let fromDate = "";

  if (!existing || existing.length === 0) {
    if (stops.length === 0) return NextResponse.json({ error: "There are no Bentkey stops to move." }, { status: 400 });
    const placed = scatterDays(stops);
    fromDate = placed.map((s) => s.next_due).sort()[0];
    const rows = expandStops(placed, fromDate.slice(0, 4) + "-12-31");
    for (let i = 0; i < rows.length; i += 400) {
      const { error } = await supabase.from("revenue_accounts").insert(rows.slice(i, i + 400));
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    inserted = rows.length;
  } else {
    fromDate = existing.map((r: any) => r.scheduled_date as string).sort()[0];
  }

  // Replace the old entries for these accounts from their first date on (keeping any that
  // already have a work order), then clear the old list.
  const { data: removedRows, error: removeError } = await supabase
    .from("revenue_accounts")
    .delete()
    .in("name", OLD_BENTKEY_NAMES)
    .gte("scheduled_date", fromDate)
    .is("job_id", null)
    .not("series_id", "like", "bk::%")
    .select("id");
  if (removeError) return NextResponse.json({ error: removeError.message, inserted }, { status: 500 });

  const ids = (stopRows ?? []).map((r: any) => r.id as string);
  for (let i = 0; i < ids.length; i += 50) {
    await supabase.from("bentkey_stops").delete().in("id", ids.slice(i, i + 50));
  }

  return NextResponse.json({ inserted, removed: (removedRows ?? []).length, stops: stops.length });
}
