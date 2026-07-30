import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/Navbar";
import { NewJobForm } from "@/components/NewJobForm";
import type { Customer, Profile } from "@/lib/types";

export default async function ImportPage({
  searchParams,
}: {
  searchParams: { customer_id?: string; client_name?: string };
}) {
  const supabase = createClient();
  const { data: crew } = await supabase.from("profiles").select("*").order("full_name");
  const { data: customers } = await supabase.from("customers").select("*").order("name");

  return (
    <>
      <Navbar role="admin" />
      <main className="max-w-2xl mx-auto px-4 py-6 pb-24">
        <h1 className="font-display text-2xl font-bold mb-1">New Job</h1>
        <p className="text-steel text-sm mb-6">
          Upload the unit list, assign it to a client and date, then review before scheduling.{" "}
          <Link href="/admin/bulk-import" className="text-safety font-semibold hover:underline">
            Importing several spreadsheets at once? Use Bulk Import →
          </Link>
        </p>
        <NewJobForm
          crew={(crew as Profile[]) ?? []}
          customers={(customers as Customer[]) ?? []}
          initialCustomerId={searchParams.customer_id}
          initialClientName={searchParams.client_name}
        />
      </main>
    </>
  );
}
