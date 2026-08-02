import Link from "next/link";
import clsx from "clsx";
import type { Job } from "@/lib/types";
import { formatWorkOrderNumber } from "@/lib/format";

const STATUS_LABEL: Record<Job["status"], string> = {
  scheduled: "Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
};

const STATUS_STYLE: Record<Job["status"], string> = {
  scheduled: "bg-steel/10 text-steel",
  in_progress: "bg-safety/10 text-safety",
  completed: "bg-go/10 text-go",
};

export function JobCard({ job }: { job: Job }) {
  return (
    <Link
      href={`/jobs/${job.id}`}
      className="flex items-center justify-between bg-white border border-line rounded-lg px-4 py-4 hover:border-ink transition"
    >
      <div>
        <p className="text-[11px] font-mono font-semibold text-safety">
          {job.job_number ? formatWorkOrderNumber(job.job_number) : "Not yet scheduled"}
        </p>
        <p className="font-semibold">{job.client_name}</p>
        <p className="text-xs text-steel font-mono mt-0.5">{job.scheduled_date ?? "Unscheduled"}</p>
      </div>
      <span className={clsx("text-xs font-semibold px-2.5 py-1 rounded-full", STATUS_STYLE[job.status])}>
        {STATUS_LABEL[job.status]}
      </span>
    </Link>
  );
}
