import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/Navbar";
import { JobChecklist } from "@/components/JobChecklist";
import { formatWorkOrderNumber } from "@/lib/format";
import type { Customer, Job, Profile, Unit } from "@/lib/types";

export default async function JobDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single();

  const isAdmin = profile?.role === "admin";

  const { data: job } = await supabase.from("jobs").select("*").eq("id", params.id).single();
  if (!job) notFound();

  const { data: units } = await supabase
    .from("units")
    .select("*")
    .eq("job_id", params.id)
    .order("sort_order");

  const { data: crewLinks } = await supabase
    .from("job_crew")
    .select("profile_id, profiles(id, full_name, role, created_at)")
    .eq("job_id", params.id);

  const crew = (crewLinks ?? []).map((c: any) => c.profiles as Profile).filter(Boolean);

  let customer: Customer | null = null;
  if (isAdmin && (job as Job).customer_id) {
    const { data } = await supabase.from("customers").select("*").eq("id", (job as Job).customer_id).single();
    customer = data as Customer | null;
  }

  return (
    <>
      <Navbar role={profile?.role ?? "crew"} />
      <main className="max-w-2xl mx-auto px-4 py-6 pb-24">
        <Link href="/calendar" className="text-sm text-steel hover:text-ink">
          Back to calendar
        </Link>

        <div className="flex items-start justify-between mt-2 mb-1">
          <div>
            <p className="text-xs font-mono font-semibold text-safety">
              {(job as Job).job_number ? formatWorkOrderNumber((job as Job).job_number as number) : "Not yet scheduled"}
            </p>
            <h1 className="font-display text-2xl font-bold">{(job as Job).client_name}</h1>
          </div>
          {isAdmin && (
            <Link
              href={`/admin/jobs/${job.id}/edit`}
              className="text-sm font-medium text-safety hover:underline shrink-0 ml-3 mt-1"
            >
              Edit Job
            </Link>
          )}
        </div>

        <p className="text-steel text-sm font-mono mb-1">{(job as Job).scheduled_date ?? "Unscheduled"}</p>
        <p className="text-steel text-sm mb-6">
          Crew: {crew.length ? crew.map((c) => c.full_name).join(", ") : "Unassigned"}
        </p>

        {/* Admin-only: customer contact info is not exposed to crew */}
        {customer && (customer.contact_name || customer.phone || customer.email || customer.address) && (
          <div className="bg-white border border-line rounded-lg p-3 mb-6 text-sm flex flex-col gap-0.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-steel mb-1">Site Contact</p>
            {customer.contact_name && <p className="font-medium">{customer.contact_name}</p>}
            {customer.phone && (
              <a href={`tel:${customer.phone}`} className="text-safety">
                {customer.phone}
              </a>
            )}
            {customer.email && (
              <a href={`mailto:${customer.email}`} className="text-safety">
                {customer.email}
              </a>
            )}
            {customer.address && <p className="text-steel">{customer.address}</p>}
            {customer.notes && <p className="text-steel italic mt-1">{customer.notes}</p>}
          </div>
        )}

        <JobChecklist job={job as Job} initialUnits={(units as Unit[]) ?? []} isAdmin={isAdmin} />
      </main>
    </>
  );
}
