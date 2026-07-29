import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Only admins can add customers" }, { status: 403 });
  }

  const body = await request.json();
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Customer name is required." }, { status: 400 });
  }
  if (!["weekly", "biweekly", "monthly"].includes(body.frequency)) {
    return NextResponse.json({ error: "Frequency must be weekly, biweekly, or monthly." }, { status: 400 });
  }

  const { data: customer, error } = await supabase
    .from("customers")
    .insert({
      name: body.name.trim(),
      contact_name: body.contact_name || null,
      phone: body.phone || null,
      email: body.email || null,
      address: body.address || null,
      frequency: body.frequency,
      notes: body.notes || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ customer }, { status: 201 });
}
