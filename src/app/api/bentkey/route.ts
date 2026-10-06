import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BENTKEY_SEED } from "@/lib/bentkey-seed";
import { addDaysISO, mondayOf, splitIntoGroups, stopsForWeek, type Stop } from "@/lib/bentkey";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const COLUMNS = "id, name, amount, every_weeks, next_due, last_serviced, active";

function isDate(s: unknown): s is string {
  return typeof s === "string" && DATE_RE.test(s) && !Number.isNaN(new Date(s + "T00:00:00Z").getTime());
}

async function requireAdmin(supabase: ReturnType<typeof createClient>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, error: "Not signed in" };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { ok: false as const, status: 403, error: "Admins only" };
  return { ok: true as const, userId: user.id };
}

function asStop(r: any): Stop {
  return {
    id: r.id,
    name: r.name,
    amount: Number(r.amount),
    every_weeks: Number(r.every_weeks),
    next_due: r.next_due,
    last_serviced: r.last_serviced ?? null,
    active: !!r.active,
  };
}

// POST: load the starting list, add a stop, or create one week's Bentkey work order.
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const auth = await requireAdmin(supabase);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await request.json();

  if (body.action === "seed") {
    if (!isDate(body.week_start) || mondayOf(body.week_start) !== body.week_start) {
      return NextResponse.json({ error: "Pick a week that starts on a Monday." }, { status: 400 });
    }
    const { count } = await supabase.from("bentkey_stops").select("id", { count: "exact", head: true });
    if ((count ?? 0) > 0) return NextResponse.json({ error: "The list is already loaded." }, { status: 409 });
    // Spread the every-3-weeks stops over three weeks so each week carries about the same dollars.
    const threeWeek = BENTKEY_SEED.filter((s) => s[2] === 3);
    const groups = splitIntoGroups(
      threeWeek.map((s) => s[1]),
      3
    );
    const groupOf = new Map(threeWeek.map((s, i) => [s[0], groups[i]]));
    const rows = BENTKEY_SEED.map(([name, amount, every_weeks]) => ({
      name,
      amount,
      every_weeks,
      next_due: addDaysISO(body.week_start, 7 * (groupOf.get(name) ?? 0)),
    }));
    const { data, error } = await supabase.from("bentkey_stops").insert(rows).select(COLUMNS);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ stops: (data ?? []).map(asStop) });
  }

  if (body.action === "add") {
    const name = String(body.name ?? "").trim();
    const amount = Number(body.amount);
    const every = Number(body.every_weeks);
    if (!name || name.length > 80) return NextResponse.json({ error: "Enter the stop's name." }, { status: 400 });
    if (!Number.isFinite(amount) || amount < 0) return NextResponse.json({ error: "Enter a dollar amount." }, { status: 400 });
    if (!Number.isInteger(every) || every < 1 || every > 12) {
      return NextResponse.json({ error: "Pick how many weeks between visits." }, { status: 400 });
    }
    if (!isDate(body.next_due)) return NextResponse.json({ error: "Pick the next due date." }, { status: 400 });
    const { data, error } = await supabase
      .from("bentkey_stops")
      .insert({ name, amount, every_weeks: every, next_due: body.next_due })
      .select(COLUMNS)
      .single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? "Couldn't add that stop." }, { status: 500 });
    return NextResponse.json({ stop: asStop(data) });
  }

  if (body.action === "create_week") {
    if (!isDate(body.week_start) || mondayOf(body.week_start) !== body.week_start) {
      return NextResponse.json({ error: "Pick a week that starts on a Monday." }, { status: 400 });
    }
    const weekStart: string = body.week_start;
    const scheduled = isDate(body.scheduled_date) ? body.scheduled_date : weekStart;
    if (scheduled < weekStart || scheduled > addDaysISO(weekStart, 6)) {
      return NextResponse.json({ error: "The date has to fall inside that week." }, { status: 400 });
    }

    const { data: existing } = await supabase.from("jobs").select("id").eq("bentkey_week", weekStart);
    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: "That week already has a Bentkey work order.", job_id: existing[0].id },
        { status: 409 }
      );
    }

    const { data: stopRows, error: stopsError } = await supabase.from("bentkey_stops").select(COLUMNS).eq("active", true);
    if (stopsError) return NextResponse.json({ error: stopsError.message }, { status: 500 });
    const due = stopsForWeek((stopRows ?? []).map(asStop), weekStart);
    if (due.length === 0) return NextResponse.json({ error: "No Bentkey stops are due that week." }, { status: 400 });

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .insert({
        client_name: "Bentley (Bentkey)",
        scheduled_date: scheduled,
        bentkey_week: weekStart,
        created_by: auth.userId,
      })
      .select("id")
      .single();
    if (jobError || !job) {
      if (jobError?.code === "23505") {
        return NextResponse.json({ error: "That week already has a Bentkey work order." }, { status: 409 });
      }
      return NextResponse.json({ error: jobError?.message ?? "Couldn't create the work order." }, { status: 500 });
    }

    const unitRows = due.map((d, i) => ({
      job_id: job.id,
      unit_number: d.stop.name,
      location: d.overdue ? "Overdue" : null,
      unit_type: "Bentkey",
      sort_order: i,
      bentkey_stop_id: d.stop.id,
    }));
    const { error: unitsError } = await supabase.from("units").insert(unitRows);
    if (unitsError) {
      await supabase.from("jobs").delete().eq("id", job.id);
      return NextResponse.json({ error: unitsError.message }, { status: 500 });
    }

    return NextResponse.json({
      job_id: job.id,
      stops: due.length,
      overdue: due.filter((d) => d.overdue).length,
      dollars: due.reduce((s, d) => s + d.stop.amount, 0),
    });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

// PATCH: edit a stop (amount, how often, next due date, name, paused or not).
export async function PATCH(request: NextRequest) {
  const supabase = createClient();
  const auth = await requireAdmin(supabase);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await request.json();
  if (typeof body.id !== "string") return NextResponse.json({ error: "Missing stop." }, { status: 400 });
  const f = body.fields ?? {};
  const updates: Record<string, unknown> = {};
  if (f.name !== undefined) {
    const name = String(f.name).trim();
    if (!name || name.length > 80) return NextResponse.json({ error: "Enter the stop's name." }, { status: 400 });
    updates.name = name;
  }
  if (f.amount !== undefined) {
    const amount = Number(f.amount);
    if (!Number.isFinite(amount) || amount < 0) return NextResponse.json({ error: "Enter a dollar amount." }, { status: 400 });
    updates.amount = amount;
  }
  if (f.every_weeks !== undefined) {
    const every = Number(f.every_weeks);
    if (!Number.isInteger(every) || every < 1 || every > 12) {
      return NextResponse.json({ error: "Pick how many weeks between visits." }, { status: 400 });
    }
    updates.every_weeks = every;
  }
  if (f.next_due !== undefined) {
    if (!isDate(f.next_due)) return NextResponse.json({ error: "Pick a valid date." }, { status: 400 });
    updates.next_due = f.next_due;
  }
  if (f.active !== undefined) updates.active = f.active === true;
  if (Object.keys(updates).length === 0) return NextResponse.json({ ok: true });
  const { error } = await supabase.from("bentkey_stops").update(updates).eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE: remove a stop for good (past work orders keep their checklist).
export async function DELETE(request: NextRequest) {
  const supabase = createClient();
  const auth = await requireAdmin(supabase);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await request.json();
  if (typeof body.id !== "string") return NextResponse.json({ error: "Missing stop." }, { status: 400 });
  const { error } = await supabase.from("bentkey_stops").delete().eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
