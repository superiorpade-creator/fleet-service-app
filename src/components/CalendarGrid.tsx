"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, format, isSameMonth } from "date-fns";
import clsx from "clsx";
import type { Job } from "@/lib/types";

const STATUS_DOT = {
  scheduled: "bg-steel",
  in_progress: "bg-safety",
  completed: "bg-go",
};

/**
 * Renders a single month's day grid for a given set of jobs. Deliberately
 * has no month-navigation controls of its own - when several of these are
 * stacked (one per crew member), they all need to move together off one
 * shared header (CalendarMonthNav), not scroll independently.
 */
export function CalendarGrid({ monthDate, jobs, label }: { monthDate: Date; jobs: Job[]; label?: string }) {
  const [todayKey, setTodayKey] = useState<string | null>(null);
  useEffect(() => {
    setTodayKey(format(new Date(), "yyyy-MM-dd"));
  }, []);

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(monthDate)),
    end: endOfWeek(endOfMonth(monthDate)),
  });

  const jobsByDate = jobs.reduce<Record<string, Job[]>>((acc, job) => {
    if (!job.scheduled_date) return acc;
    (acc[job.scheduled_date] ??= []).push(job);
    return acc;
  }, {});

  return (
    <div className="max-w-5xl mx-auto px-4">
      {label && <h2 className="font-display text-lg font-semibold mb-2">{label}</h2>}

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
                  key === todayKey && "bg-safety text-white font-semibold"
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
                {dayJobs.length > 3 && <span className="text-[11px] text-steel">+{dayJobs.length - 3} more</span>}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
