import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/Navbar";
import { SendPdfsForm } from "@/components/SendPdfsForm";
import type { Customer, Job } from "@/lib/types";

export default async function SendPdfsPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: customer } = await supabase.from("customers").select("*").eq("id", params.id).single();
  if (!customer) notFound();

  // Completed work orders for this customer that actually have a PDF ready
  // to send - anything still in progress or without a generated PDF yet
  // wouldn't make sense to include.
  const { data: jobs } = await supabase
    .from("jobs")
    .select("*")
    .eq("customer_id", params.id)
    .eq("status", "completed")
    .not("pdf_url", "is", null)
    .order("scheduled_date", { ascending: false });

  return (
    <>
      <Navbar role="admin" />
      <main className="max-w-2xl mx-auto px-4 py-6 pb-24">
        <h1 className="font-display text-2xl font-bold mb-1">Send Work Orders</h1>
        <p className="text-steel text-sm mb-6">
          Pick the completed work orders you want to send {(customer as Customer).name} - each one
          downloads as a PDF, then Outlook opens ready for you to attach them and send.
        </p>
        <SendPdfsForm customer={customer as Customer} jobs={(jobs as Job[]) ?? []} />
      </main>
    </>
  );
}
