import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/Navbar";
import { JobCard } from "@/components/JobCard";
import { format, parseISO } from "date-fns";
import type { Job } from "@/lib/types";

export default async function DayPage({ params }: { params: { date: string } }) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single();

  const { data: jobs } = await supabase
    .from("jobs")
    .select("*")
    .eq("scheduled_date", params.date)
    .order("client_name");

  const dayLabel = format(parseISO(params.date), "EEEE, MMMM d, yyyy");

  return (
    <>
      <Navbar role={profile?.role ?? "crew"} />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <Link href="/calendar" className="text-sm text-steel hover:text-ink">
          ← Back to calendar
        </Link>
        <h1 className="font-display text-2xl font-bold mt-2 mb-5">{dayLabel}</h1>

        {(!jobs || jobs.length === 0) && (
          <p className="text-steel text-sm">No jobs scheduled for this day.</p>
        )}

        <div className="flex flex-col gap-3">
          {(jobs as Job[] | null)?.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      </main>
    </>
  );
}
