import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/Navbar";
import { CrewManager } from "@/components/CrewManager";
import type { Profile } from "@/lib/types";

export default async function CrewPage() {
  const supabase = createClient();
  const { data: crew } = await supabase.from("profiles").select("*").order("full_name");

  return (
    <>
      <Navbar role="admin" />
      <main className="max-w-2xl mx-auto px-4 py-6 pb-24">
        <h1 className="font-display text-2xl font-bold mb-1">Crew Accounts</h1>
        <p className="text-steel text-sm mb-6">Add or remove logins for your crew.</p>
        <CrewManager initialCrew={(crew as Profile[]) ?? []} />
      </main>
    </>
  );
}
