"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
 *
 * When `draggable` is on (admin only - crew never get this), each job can
 * be dragged onto a different day to reschedule it - e.g. moving a day's
 * jobs off a rain-out date. This uses the browser's native drag-and-drop,
 * which only responds to mouse dragging, not touch - so this only works
 * from a desktop/laptop, not a phone or tablet.
 */
export function CalendarGrid({
  monthDate,
  jobs,
  label,
  draggable,
}: {
  monthDate: Date;
  jobs: Job[];
  label?: string;
  draggable?: boolean;
}) {
  const router = useRouter();
  const [todayKey, setTodayKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  function handleDragStart(e: React.DragEvent, jobId: string) {
    e.dataTransfer.setData("text/job-id", jobId);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent, dayKey: string) {
    if (!draggable) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverKey(dayKey);
  }

  async function handleDrop(e: React.DragEvent, dayKey: string) {
    if (!draggable) return;
    e.preventDefault();
    setDragOverKey(null);
    const jobId = e.dataTransfer.getData("text/job-id");
    if (!jobId) return;

    const job = jobs.find((j) => j.id === jobId);
    if (!job || job.scheduled_date === dayKey) return;

    setMoving(true);
    setError(null);
    const res = await fetch(`/api/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduled_date: dayKey }),
    });
    setMoving(false);

    if (!res.ok) {
      setError("Couldn't move that job. Try again.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="max-w-5xl mx-auto px-4">
      {label && <h2 className="font-display text-lg font-semibold mb-2">{label}</h2>}
      {error && <p className="text-alert text-sm mb-2">{error}</p>}

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
              onDragOver={(e) => handleDragOver(e, key)}
              onDragLeave={() => setDragOverKey((k) => (k === key ? null : k))}
              onDrop={(e) => handleDrop(e, key)}
              className={clsx(
                "bg-white min-h-[92px] p-1.5 flex flex-col gap-1 hover:bg-paper transition",
                !isSameMonth(day, monthDate) && "bg-paper/60 text-steel/50",
                dragOverKey === key && "ring-2 ring-inset ring-safety bg-safety/5"
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
                    draggable={draggable}
                    onDragStart={(e) => handleDragStart(e, job.id)}
                    className={clsx(
                      "flex items-center gap-1 text-[11px] leading-tight truncate",
                      draggable && "cursor-grab active:cursor-grabbing"
                    )}
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
      {moving && <p className="text-xs text-steel mt-1">Moving...</p>}
    </div>
  );
}
