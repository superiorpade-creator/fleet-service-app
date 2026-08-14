import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Handles the redirect Supabase sends users back to after they click an
// invite or password-reset email link. Under the PKCE flow (used by
// @supabase/ssr), that link contains a one-time ?code=... in the query
// string, NOT a #access_token=... hash - so it has to be explicitly
// exchanged for a real session here, server-side, before the user lands
// back on /login to actually set their password.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const type = searchParams.get("type");

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
    }
  }

  const params = new URLSearchParams();
  if (type) params.set("type", type);
  return NextResponse.redirect(`${origin}/login${params.toString() ? `?${params.toString()}` : ""}`);
}
