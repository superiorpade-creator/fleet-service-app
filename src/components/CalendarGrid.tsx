"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isToday,
  addMonths,
  subMonths,
} from "date-fns";
import clsx from "clsx";
import type { Job } from "@/lib/types";

const STATUS_DOT = {
  scheduled: "bg-steel",
  in_progress: "bg-safety",
  completed: "bg-go",
};

export function CalendarGrid({ monthDate, jobs }: { monthDate: Date; jobs: Job[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(monthDate)),
    end: endOfWeek(endOfMonth(monthDate)),
  });

  const jobsByDate = jobs.reduce<Record<string, Job[]>>((acc, job) => {
    if (!job.scheduled_date) return acc;
    (acc[job.scheduled_date] ??= []).push(job);
    return acc;
  }, {});

  // Wrapping the navigation in startTransition (and disabling the buttons
  // while isPending) prevents a fast double-click from firing two
  // overlapping navigations - without this, a slower first request could
  // resolve AFTER a second one and silently overwrite it with stale
  // content, which is what was causing month navigation to appear to
  // skip or freeze on an old month.
  function goToMonth(date: Date) {
    if (isPending) return;
    const params = new URLSearchParams(searchParams);
    params.set("month", format(date, "yyyy-MM"));
    startTransition(() => {
      router.push(`/calendar?${params.toString()}`);
    });
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          {format(monthDate, "MMMM yyyy")}
          {isPending && <span className="text-sm font-normal text-steel">Loading...</span>}
        </h1>
        <div className="flex gap-2">
          <button
            onClick={() => goToMonth(subMonths(monthDate, 1))}
            disabled={isPending}
            className="px-3 py-2 border border-line rounded hover:bg-white transition text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ← Prev
          </button>
          <button
            onClick={() => goToMonth(new Date())}
            disabled={isPending}
            className="px-3 py-2 border border-line rounded hover:bg-white transition text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Today
          </button>
          <button
            onClick={() => goToMonth(addMonths(monthDate, 1))}
            disabled={isPending}
            className="px-3 py-2 border border-line rounded hover:bg-white transition text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px bg-line border border-line rounded overflow-hidden text-xs font-medium text-steel uppercase">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="bg-paper px-2 py-2 text-center">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px bg-line border border-t-0 border-line rounded-b overflow-hidden">
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const dayJobs = jobsByDate[key] ?? [];
          return (
            <Link
              href={`/calendar/${key}`}
              key={key}
              className={clsx(
                "bg-white min-h-[92px] p-1.5 flex flex-col gap-1 hover:bg-paper transition",
                !isSameMonth(day, monthDate) && "bg-paper/60 text-steel/50"
              )}
            >
              <span
                className={clsx(
                  "text-xs font-mono w-5 h-5 flex items-center justify-center rounded-full",
                  isToday(day) && "bg-safety text-white font-semibold"
                )}
              >
                {format(day, "d")}
              </span>
              <div className="flex flex-col gap-0.5">
                {dayJobs.slice(0, 3).map((job) => (
                  <span
                    key={job.id}
                    className="flex items-center gap-1 text-[11px] leading-tight truncate"
                    title={job.client_name}
                  >
                    <span className={clsx("w-1.5 h-1.5 rounded-full shrink-0", STATUS_DOT[job.status])} />
                    <span className="truncate">{job.client_name}</span>
                  </span>
                ))}
                {dayJobs.length > 3 && (
                  <span className="text-[11px] text-steel">+{dayJobs.length - 3} more</span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
