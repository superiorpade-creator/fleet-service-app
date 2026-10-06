import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/Navbar";
import { BentkeyManager } from "@/components/BentkeyManager";
import type { Stop } from "@/lib/bentkey";

export const dynamic = "force-dynamic";

export default async function BentkeyPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/calendar");

  const { data, error } = await supabase
    .from("bentkey_stops")
    .select("id, name, amount, every_weeks, next_due, last_serviced, active")
    .order("name");
  const stops: Stop[] = (data ?? []).map((r: any) => ({
    id: r.id,
    name: r.name,
    amount: Number(r.amount),
    every_weeks: Number(r.every_weeks),
    next_due: r.next_due,
    last_serviced: r.last_serviced ?? null,
    active: !!r.active,
  }));

  return (
    <>
      <Navbar role="admin" />
      <main className="max-w-5xl mx-auto px-4 py-6 pb-24">
        <h1 className="font-display text-2xl font-bold mb-1">Bentkey stops</h1>
        <p className="text-steel text-sm mb-6">
          One work order a week, with each stop as a checklist item. A stop crews skip stays due and carries into the
          next week, so it can&apos;t disappear.
        </p>
        {error ? (
          <div className="bg-white border border-line rounded-lg p-4 text-sm">
            <p className="font-semibold mb-1">The Bentkey tables aren&apos;t set up yet.</p>
            <p className="text-steel">Run the one-time setup SQL in Supabase, then reload this page. ({error.message})</p>
          </div>
        ) : (
          <BentkeyManager initialStops={stops} />
        )}
      </main>
    </>
  );
}
