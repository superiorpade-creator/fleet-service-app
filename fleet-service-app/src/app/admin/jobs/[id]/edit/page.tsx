import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/Navbar";
import { EditJobForm } from "@/components/EditJobForm";
import type { Customer, Job, Profile, Unit } from "@/lib/types";

export default async function EditJobPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: job } = await supabase.from("jobs").select("*").eq("id", params.id).single();
  if (!job) notFound();

  const { data: units } = await supabase
    .from("units")
    .select("*")
    .eq("job_id", params.id)
    .order("sort_order");

  const { data: allCrew } = await supabase.from("profiles").select("*").order("full_name");
  const { data: customers } = await supabase.from("customers").select("*").order("name");

  const { data: crewLinks } = await supabase.from("job_crew").select("profile_id").eq("job_id", params.id);
  const assignedCrewIds = (crewLinks ?? []).map((c) => c.profile_id);

  return (
    <>
      <Navbar role="admin" />
      <main className="max-w-2xl mx-auto px-4 py-6 pb-24">
        <h1 className="font-display text-2xl font-bold mb-1">Edit Job</h1>
        <p className="text-steel text-sm mb-6">{(job as Job).client_name}</p>
        <EditJobForm
          job={job as Job}
          initialUnits={(units as Unit[]) ?? []}
          crew={(allCrew as Profile[]) ?? []}
          customers={(customers as Customer[]) ?? []}
          assignedCrewIds={assignedCrewIds}
        />
      </main>
    </>
  );
}
