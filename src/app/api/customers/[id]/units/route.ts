import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ImportedUnitRow } from "@/lib/types";

// GET: fetch a customer's saved default unit list, used by New Job to
// auto-fill the checklist when that customer is selected.
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data, error } = await supabase
    .from("customer_units")
    .select("*")
    .eq("customer_id", params.id)
    .order("sort_order");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ units: data ?? [] });
}

// PUT: replace a customer's default unit list wholesale. Used when an
// admin edits the "usual fleet" on a customer's profile - e.g. removing a
// truck that's been sold, or adding a new one. This only affects future
// jobs created for this customer; it never touches past work orders.
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  const { units }: { units: ImportedUnitRow[] } = await request.json();
  if (!Array.isArray(units)) {
    return NextResponse.json({ error: "Invalid unit list." }, { status: 400 });
  }

  await supabase.from("customer_units").delete().eq("customer_id", params.id);

  if (units.length > 0) {
    const { error } = await supabase.from("customer_units").insert(
      units
        .filter((u) => u.unit_number.trim().length > 0)
        .map((u, i) => ({
          customer_id: params.id,
          unit_number: u.unit_number,
          location: u.location ?? null,
          unit_type: u.unit_type ?? null,
          sort_order: i,
        }))
    );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
