import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { REVENUE_SEED } from "@/lib/revenue-seed";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const COLUMNS = "id, name, amount, scheduled_date, series_id";
const MAX_OCCURRENCES = 150;

async function requireAdmin(supabase: ReturnType<typeof createClient>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, error: "Not signed in" };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { ok: false as const, status: 403, error: "Admins only" };
  return { ok: true as const };
}

function isRealDate(s: unknown): s is string {
  return typeof s === "string" && DATE_RE.test(s) && !Number.isNaN(new Date(s + "T00:00:00Z").getTime());
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// POST: either load the starting schedule (only when the table is empty), or
// add a new account - once, or repeating every N weeks through a last date.
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const auth = await requireAdmin(supabase);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json();

  if (body.action === "seed") {
    const { count } = await supabase.from("revenue_accounts").select("id", { count: "exact", head: true });
    if ((count ?? 0) > 0) {
      return NextResponse.json({ error: "The schedule is already loaded." }, { status: 409 });
    }
    const rows = REVENUE_SEED.map(([name, amount, scheduled_date, series_id]) => ({
      name,
      amount,
      scheduled_date,
      series_id,
    }));
    const { data, error } = await supabase.from("revenue_accounts").insert(rows).select(COLUMNS);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ rows: data ?? [] });
  }

  if (body.action === "add") {
    const name = String(body.name ?? "").trim();
    const amount = Number(body.amount);
    const everyWeeks = Number(body.every_weeks ?? 0);
    if (!name) return NextResponse.json({ error: "Account name is required." }, { status: 400 });
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Enter an amount greater than zero." }, { status: 400 });
    }
    if (!isRealDate(body.first_date)) {
      return NextResponse.json({ error: "Pick a first service date." }, { status: 400 });
    }
    if (!Number.isInteger(everyWeeks) || everyWeeks < 0 || everyWeeks > 12) {
      return NextResponse.json({ error: "Invalid repeat interval." }, { status: 400 });
    }

    const dates: string[] = [body.first_date];
    if (everyWeeks > 0) {
      if (!isRealDate(body.until)) {
        return NextResponse.json({ error: "Pick a last date for the repeat." }, { status: 400 });
      }
      let next = addDays(body.first_date, everyWeeks * 7);
      while (next <= body.until && dates.length < MAX_OCCURRENCES) {
        dates.push(next);
        next = addDays(next, everyWeeks * 7);
      }
    }

    const series_id = `${name}__${Date.now().toString(36)}`;
    const rows = dates.map((scheduled_date) => ({ name, amount, scheduled_date, series_id }));
    const { data, error } = await supabase.from("revenue_accounts").insert(rows).select(COLUMNS);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ rows: data ?? [] });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

// PATCH: move occurrences to new dates (drag-and-drop).
export async function PATCH(request: NextRequest) {
  const supabase = createClient();
  const auth = await requireAdmin(supabase);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json();
  const moves: { id: string; scheduled_date: string }[] = Array.isArray(body.moves) ? body.moves : [];
  if (moves.length === 0 || moves.length > 500) {
    return NextResponse.json({ error: "Nothing to move." }, { status: 400 });
  }
  for (const m of moves) {
    if (typeof m.id !== "string" || !isRealDate(m.scheduled_date)) {
      return NextResponse.json({ error: "Invalid move." }, { status: 400 });
    }
  }

  const results = await Promise.all(
    moves.map((m) => supabase.from("revenue_accounts").update({ scheduled_date: m.scheduled_date }).eq("id", m.id))
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE: drop occurrences (one, this-and-later, or a whole series - the
// screen works out which ids).
export async function DELETE(request: NextRequest) {
  const supabase = createClient();
  const auth = await requireAdmin(supabase);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json();
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((id: unknown) => typeof id === "string") : [];
  if (ids.length === 0) return NextResponse.json({ error: "Nothing to remove." }, { status: 400 });

  for (let i = 0; i < ids.length; i += 50) {
    const { error } = await supabase
      .from("revenue_accounts")
      .delete()
      .in("id", ids.slice(i, i + 50));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
