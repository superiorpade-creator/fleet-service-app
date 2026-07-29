import { createBrowserClient } from "@supabase/ssr";

// Use this client inside Client Components ("use client").
// It reads the same auth cookies the server client sets, so the
// session stays in sync between server and browser.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
