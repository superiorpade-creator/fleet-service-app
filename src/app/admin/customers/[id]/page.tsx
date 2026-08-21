import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/Navbar";
import { CustomerDetail } from "@/components/CustomerDetail";
import type { Customer, Job, Unit } from "@/lib/types";

export default async function CustomerDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: customer } = await supabase.from("customers").select("*").eq("id", params.id).single();
  if (!customer) notFound();

  // Every work order this customer's ever had, most recent first - this is
  // the service-date summary at the top of the page.
  const { data: jobs } = await supabase
    .from("jobs")
    .select("*")
    .eq("customer_id", params.id)
    .order("scheduled_date", { ascending: false, nullsFirst: false });

  const jobIds = (jobs ?? []).map((j) => j.id);

  // Every unit that's ever appeared on one of this customer's work orders -
  // powers the "when was this truck last serviced" search below. A truck
  // that's come up on several visits will have one row per job here, so
  // the search picks out the most recent serviced_at per unit number.
  const { data: units } =
    jobIds.length > 0
      ? await supabase.from("units").select("*").in("job_id", jobIds)
      : { data: [] as Unit[] };

  return (
    <>
      <Navbar role="admin" />
      <main className="max-w-3xl mx-auto px-4 py-6 pb-24">
        <h1 className="font-display text-2xl font-bold mb-1">{(customer as Customer).name}</h1>
        <p className="text-steel text-sm mb-6">Service history and unit lookup for this account.</p>
        <CustomerDetail customer={customer as Customer} jobs={(jobs as Job[]) ?? []} units={(units as Unit[]) ?? []} />
      </main>
    </>
  );
}
