import { Navbar } from "@/components/Navbar";
import { BillingPdfsForm } from "@/components/BillingPdfsForm";

export default function BillingPage() {
  return (
    <>
      <Navbar role="admin" />
      <main className="max-w-3xl mx-auto px-4 py-6 pb-24">
        <h1 className="font-display text-2xl font-bold mb-1">Billing Packet</h1>
        <p className="text-steel text-sm mb-6">
          Pick a date range and combine every completed work order in it into one PDF, ready to send to billing.
        </p>
        <BillingPdfsForm />
      </main>
    </>
  );
}
