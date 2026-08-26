"use client";

import { useEffect, useState } from "react";
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
  addMonths,
  subMonths,
} from "date-fns";
import clsx from "clsx";
import type { Job, Profile } from "@/lib/types";

const STATUS_DOT = {
  scheduled: "bg-steel",
  in_progress: "bg-safety",
  completed: "bg-go",
};

export function CalendarGrid({
  monthDate,
  jobs,
  isAdmin,
  crewList,
  selectedCrewId,
}: {
  monthDate: Date;
  jobs: Job[];
  isAdmin?: boolean;
  crewList?: Profile[];
  selectedCrewId?: string | null;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();

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

  function monthHref(date: Date) {
    const params = new URLSearchParams(searchParams);
    params.set("month", format(date, "yyyy-MM"));
    return `/calendar?${params.toString()}`;
  }

  function handleCrewChange(crewId: string) {
    const params = new URLSearchParams(searchParams);
    if (crewId) params.set("crew", crewId);
    else params.delete("crew");
    router.push(`/calendar?${params.toString()}`);
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="font-display text-2xl font-bold">{format(monthDate, "MMMM yyyy")}</h1>
        <div className="flex gap-2 items-center flex-wrap">
          {isAdmin && crewList && crewList.length > 0 && (
            <select
              value={selectedCrewId ?? ""}
              onChange={(e) => handleCrewChange(e.target.value)}
              className="px-3 py-2 border border-line rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-safety"
            >
              <option value="">All Crew</option>
              {crewList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </select>
          )}
          
            <a
            href={monthHref(subMonths(monthDate, 1))}
            className="px-3 py-2 border border-line rounded hover:bg-white transition text-sm"
          >
            &larr; Prev
          </a>
          
            <a
            href={monthHref(new Date())}
            className="px-3 py-2 border border-line rounded hover:bg-white transition text-sm"
          >
            Today
          </a>
          
            <a
            href={monthHref(addMonths(monthDate, 1))}
            className="px-3 py-2 border border-line rounded hover:bg-white transition text-sm"
          >
            Next &rarr;
          </a>
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
