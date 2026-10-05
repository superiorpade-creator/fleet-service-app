import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/Navbar";
import { RevenuePlanner, type RevenueRow } from "@/components/RevenuePlanner";

export const dynamic = "force-dynamic";

export default async function RevenuePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/calendar");

  // The database caps each read at 1000 rows, so read in pages - the
  // schedule can grow past that once more accounts are added.
  const rows: RevenueRow[] = [];
  let loadError: string | null = null;
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("revenue_accounts")
      .select("id, name, amount, scheduled_date, series_id, job_id")
      .order("scheduled_date")
      .order("id")
      .range(from, from + 999);
    if (error) {
      loadError = error.message;
      break;
    }
    const page = data ?? [];
    rows.push(...page.map((r: any) => ({ ...r, amount: Number(r.amount) })));
    if (page.length < 1000) break;
  }

  // Customers (for matching accounts to them) and the matches saved so far.
  const { data: customerRows } = await supabase.from("customers").select("id, name").order("name");
  const customers = (customerRows ?? []).map((c: any) => ({ id: c.id as string, name: c.name as string }));
  const { data: linkRows, error: linkError } = await supabase
    .from("revenue_customer_links")
    .select("account_name, customer_id");
  if (linkError && !loadError) loadError = linkError.message;
  const links: Record<string, string | null> = {};
  for (const l of linkRows ?? []) links[l.account_name] = l.customer_id ?? null;

  return (
    <>
      <Navbar role="admin" />
      <main className="max-w-7xl mx-auto px-4 py-6 pb-24">
        <h1 className="font-display text-2xl font-bold mb-1">Revenue Calendar</h1>
        <p className="text-steel text-sm mb-6">
          Weeks run Monday to Sunday. Drag an account to a different day to reschedule it; everything saves as you go.
          Use Create work orders on a week to turn its visits into scheduled work orders you can assign later.
        </p>
        {loadError ? (
          <div className="bg-white border border-line rounded-lg p-4 text-sm">
            <p className="font-semibold mb-1">The revenue tables aren't set up yet.</p>
            <p className="text-steel">Run the one-time setup SQL in Supabase, then reload this page. ({loadError})</p>
          </div>
        ) : (
          <RevenuePlanner initialRows={rows} customers={customers} initialLinks={links} />
        )}
      </main>
    </>
  );
}
