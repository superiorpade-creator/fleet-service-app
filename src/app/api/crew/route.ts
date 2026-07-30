import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

// Invites a new crew member by email. Supabase sends them a magic-link email
// to set their password; their profile row is created automatically by the
// handle_new_user trigger (see supabase/schema.sql) and defaults to role='crew'.
export async function POST(request: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Only admins can add crew accounts" }, { status: 403 });
  }

  const { email, full_name } = await request.json();
  if (!email?.trim() || !full_name?.trim()) {
    return NextResponse.json({ error: "Name and email are required." }, { status: 400 });
  }

  const serviceClient = createServiceRoleClient();
  const { data, error } = await serviceClient.auth.admin.inviteUserByEmail(email.trim(), {
    data: { full_name: full_name.trim() },
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/login`,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, user: data.user });
}
