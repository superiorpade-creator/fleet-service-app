import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/Navbar";
import { CustomersManager } from "@/components/CustomersManager";
import { buildCustomerStatusList } from "@/lib/service-status";
import type { Customer } from "@/lib/types";

export default async function CustomersPage() {
  const supabase = createClient();

  const { data: customers } = await supabase.from("customers").select("*").order("name");
  const { data: jobs } = await supabase.from("jobs").select("customer_id, status, completed_at, scheduled_date");

  const customersWithStatus = buildCustomerStatusList((customers as Customer[]) ?? [], jobs ?? []);

  return (
    <>
      <Navbar role="admin" />
      <main className="max-w-4xl mx-auto px-4 py-6 pb-24">
        <h1 className="font-display text-2xl font-bold mb-1">Customers</h1>
        <p className="text-steel text-sm mb-6">
          Contact info and how often each account gets serviced. Accounts that haven't been
          serviced within their window and don't have anything upcoming show up here and on the
          calendar as needing a reminder.
        </p>
        <CustomersManager initialCustomers={customersWithStatus} />
      </main>
    </>
  );
}
