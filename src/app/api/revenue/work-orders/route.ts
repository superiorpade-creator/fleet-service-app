import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { planWorkOrders, buildUnitRows, type CustomerUnitRow } from "@/lib/revenue-orders";

const MAX_VISITS = 150;

async function requireAdmin(supabase: ReturnType<typeof createClient>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, error: "Not signed in" };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { ok: false as const, status: 403, error: "Admins only" };
  return { ok: true as const, userId: user.id };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// POST: create one unassigned, scheduled work order per revenue visit - with
// the customer's saved Default Units copied on - and remember which visit
// each one came from so running it again never makes duplicates. Crew are
// assigned later, so nobody is texted here.
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const auth = await requireAdmin(supabase);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json();
  const visitsIn: { revenue_id: unknown; customer_id: unknown }[] = Array.isArray(body.visits) ? body.visits : [];
  const linksIn: { account_name: unknown; customer_id: unknown }[] = Array.isArray(body.links) ? body.links : [];
  if (visitsIn.length === 0 || visitsIn.length > MAX_VISITS) {
    return NextResponse.json({ error: "Pick between 1 and " + MAX_VISITS + " visits." }, { status: 400 });
  }
  const choices = visitsIn.map((v) => ({
    revenue_id: String(v.revenue_id),
    customer_id: typeof v.customer_id === "string" && v.customer_id ? v.customer_id : null,
  }));

  // Remember the account -> customer matches for next time.
  if (linksIn.length > 0) {
    const { error } = await supabase.from("revenue_customer_links").upsert(
      linksIn.map((l) => ({
        account_name: String(l.account_name),
        customer_id: typeof l.customer_id === "string" && l.customer_id ? l.customer_id : null,
      })),
      { onConflict: "account_name" }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // The visits, as they are right now (skips any that already have a work order).
  const visits: { id: string; name: string; scheduled_date: string; job_id: string | null }[] = [];
  for (const part of chunk(
    choices.map((c) => c.revenue_id),
    50
  )) {
    const { data, error } = await supabase
      .from("revenue_accounts")
      .select("id, name, scheduled_date, job_id")
      .in("id", part);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    visits.push(...(data ?? []));
  }

  const customerIds = Array.from(new Set(choices.map((c) => c.customer_id).filter((id): id is string => !!id)));
  const customerNames = new Map<string, string>();
  if (customerIds.length > 0) {
    const { data, error } = await supabase.from("customers").select("id, name").in("id", customerIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const c of data ?? []) customerNames.set(c.id, c.name);
  }

  const plan = planWorkOrders(visits, choices, customerNames);
  if (plan.length === 0) {
    return NextResponse.json({ created: [], skipped: visits.length });
  }

  // Each customer's saved unit list.
  const unitsByCustomer = new Map<string, CustomerUnitRow[]>();
  const usedCustomers = Array.from(new Set(plan.map((p) => p.customer_id).filter((id): id is string => !!id)));
  const unitResults = await Promise.all(
    usedCustomers.map((cid) =>
      supabase
        .from("customer_units")
        .select("customer_id, unit_number, location, unit_type, sort_order")
        .eq("customer_id", cid)
        .order("sort_order")
    )
  );
  for (let i = 0; i < usedCustomers.length; i++) {
    if (unitResults[i].error) return NextResponse.json({ error: unitResults[i].error?.message }, { status: 500 });
    unitsByCustomer.set(usedCustomers[i], (unitResults[i].data ?? []) as CustomerUnitRow[]);
  }

  async function rollback(ids: string[]) {
    for (const part of chunk(ids, 50)) await supabase.from("jobs").delete().in("id", part);
  }

  // The work orders themselves.
  const created: { id: string; client_name: string; scheduled_date: string }[] = [];
  for (const part of chunk(plan, 100)) {
    const { data, error } = await supabase
      .from("jobs")
      .insert(
        part.map((p) => ({
          client_name: p.client_name,
          customer_id: p.customer_id,
          scheduled_date: p.scheduled_date,
          created_by: auth.userId,
        }))
      )
      .select("id, client_name, scheduled_date");
    if (error || !data || data.length !== part.length) {
      await rollback(created.map((j) => j.id));
      return NextResponse.json({ error: error?.message ?? "Couldn't create the work orders." }, { status: 500 });
    }
    created.push(...data);
  }

  // Sanity check: each returned row must be the one we expect, in order.
  const mismatch = plan.some(
    (p, i) => created[i].client_name !== p.client_name || created[i].scheduled_date !== p.scheduled_date
  );
  if (mismatch) {
    await rollback(created.map((j) => j.id));
    return NextResponse.json({ error: "The database returned work orders in an unexpected order. Nothing was created." }, { status: 500 });
  }

  // Their unit checklists.
  const unitRows = plan.flatMap((p, i) => buildUnitRows(created[i].id, p.customer_id, unitsByCustomer));
  for (const part of chunk(unitRows, 500)) {
    const { error } = await supabase.from("units").insert(part);
    if (error) {
      await rollback(created.map((j) => j.id));
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // Mark each visit as done so it can't be created twice.
  const links = await Promise.all(
    plan.map((p, i) => supabase.from("revenue_accounts").update({ job_id: created[i].id }).eq("id", p.revenue_id))
  );
  const failed = links.find((r) => r.error);
  if (failed?.error) {
    return NextResponse.json(
      { error: "The work orders were created but couldn't be marked on the calendar: " + failed.error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    created: plan.map((p, i) => ({ revenue_id: p.revenue_id, job_id: created[i].id })),
    skipped: visits.length - plan.length,
  });
}
