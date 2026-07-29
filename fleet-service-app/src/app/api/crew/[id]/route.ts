import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Only admins can remove crew accounts" }, { status: 403 });
  }

  if (params.id === user.id) {
    return NextResponse.json({ error: "You can't remove your own account." }, { status: 400 });
  }

  // Deleting the auth user cascades to the profiles row (see schema.sql FK).
  const serviceClient = createServiceRoleClient();
  const { error } = await serviceClient.auth.admin.deleteUser(params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
