"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { addDays, addWeeks, subWeeks, format, parseISO } from "date-fns";
import clsx from "clsx";
import type { BoardJob, Profile } from "@/lib/types";
import { formatWorkOrderNumber } from "@/lib/format";

const STATUS_DOT: Record<BoardJob["status"], string> = {
  scheduled: "bg-steel",
  in_progress: "bg-safety",
  completed: "bg-go",
};

type DropTarget = { type: "cell"; techId: string; date: string } | { type: "unassigned" };

function cellKey(techId: string, date: string) {
  return `${techId}__${date}`;
}

export function DispatchBoard({
  weekStart,
  technicians,
  unassignedJobs,
  gridJobs,
}: {
  weekStart: string;
  technicians: Profile[];
  unassignedJobs: BoardJob[];
  gridJobs: BoardJob[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [jobs, setJobs] = useState<BoardJob[]>([...unassignedJobs, ...gridJobs]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => format(addDays(parseISO(weekStart), i), "yyyy-MM-dd")),
    [weekStart]
  );

  function goToWeek(date: Date) {
    const params = new URLSearchParams(searchParams);
    params.set("week", format(date, "yyyy-MM-dd"));
    router.push(`/admin/schedule?${params.toString()}`);
  }

  async function moveJob(jobId: string, target: DropTarget) {
    setDragging(null);
    setHovered(null);

    const prevJobs = jobs;
    const nextCrewIds = target.type === "cell" ? [target.techId] : [];
    const nextDate = target.type === "cell" ? target.date : null;

    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, crew_ids: nextCrewIds, scheduled_date: nextDate } : j))
    );

    const res = await fetch(`/api/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduled_date: nextDate, crew_ids: nextCrewIds }),
    });

    if (!res.ok) {
      setJobs(prevJobs); // revert on failure
    }
  }

  function handleDrop(e: React.DragEvent, target: DropTarget) {
    e.preventDefault();
    const jobId = e.dataTransfer.getData("jobId");
    if (jobId) moveJob(jobId, target);
  }

  const unassigned = jobs.filter((j) => j.crew_ids.length === 0);

  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">
      {/* Header / week nav */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-line bg-white shrink-0">
        <div>
          <h1 className="font-display text-xl font-bold">Dispatch Board</h1>
          <p className="text-xs text-steel">
            {format(parseISO(weekStart), "MMM d")} - {format(addDays(parseISO(weekStart), 6), "MMM d, yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/import"
            className="px-3 py-2 text-sm font-semibold bg-safety text-white rounded hover:opacity-90 transition"
          >
            + New Work Order
          </Link>
          <button
            onClick={() => goToWeek(subWeeks(parseISO(weekStart), 1))}
            className="px-3 py-2 border border-line rounded hover:bg-paper transition text-sm"
          >
            Prev
          </button>
          <button
            onClick={() => goToWeek(new Date())}
            className="px-3 py-2 border border-line rounded hover:bg-paper transition text-sm"
          >
            This Week
          </button>
          <button
            onClick={() => goToWeek(addWeeks(parseISO(weekStart), 1))}
            className="px-3 py-2 border border-line rounded hover:bg-paper transition text-sm"
          >
            Next
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Unassigned tray */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setHovered("unassigned");
          }}
          onDragLeave={() => setHovered(null)}
          onDrop={(e) => handleDrop(e, { type: "unassigned" })}
          className={clsx(
            "w-64 shrink-0 border-r border-line bg-white flex flex-col",
            hovered === "unassigned" && "bg-safety/5"
          )}
        >
          <div className="px-3 py-2.5 border-b border-line">
            <p className="text-xs font-semibold uppercase tracking-wide text-steel">
              Unassigned ({unassigned.length})
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
            {unassigned.length === 0 && (
              <p className="text-xs text-steel px-1 py-4 text-center">
                Nothing waiting - new work orders land here until you drag them onto a tech.
              </p>
            )}
            {unassigned.map((job) => (
              <BoardCard key={job.id} job={job} dragging={dragging === job.id} setDragging={setDragging} />
            ))}
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-auto">
          <div className="min-w-[900px]">
            {/* Day headers */}
            <div className="grid grid-cols-[160px_repeat(7,1fr)] sticky top-0 z-10 bg-ink text-white">
              <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide border-r border-white/10">
                Technician
              </div>
              {days.map((day) => (
                <div key={day} className="px-2 py-2 text-xs font-semibold text-center border-r border-white/10 last:border-r-0">
                  {format(parseISO(day), "EEE M/d")}
                </div>
              ))}
            </div>

            {/* Technician rows */}
            {technicians.map((tech) => (
              <div key={tech.id} className="grid grid-cols-[160px_repeat(7,1fr)] border-b border-line">
                <div className="px-3 py-2 text-sm font-medium bg-paper border-r border-line flex items-center sticky left-0">
                  {tech.full_name}
                </div>
                {days.map((day) => {
                  const key = cellKey(tech.id, day);
                  const cellJobs = jobs.filter((j) => j.crew_ids.includes(tech.id) && j.scheduled_date === day);
                  return (
                    <div
                      key={key}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setHovered(key);
                      }}
                      onDragLeave={() => setHovered(null)}
                      onDrop={(e) => handleDrop(e, { type: "cell", techId: tech.id, date: day })}
                      className={clsx(
                        "min-h-[76px] p-1.5 border-r border-line last:border-r-0 flex flex-col gap-1.5 bg-white transition",
                        hovered === key && "bg-safety/10"
                      )}
                    >
                      {cellJobs.map((job) => (
                        <BoardCard key={job.id} job={job} dragging={dragging === job.id} setDragging={setDragging} compact />
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}

            {technicians.length === 0 && (
              <p className="text-sm text-steel px-3 py-6">
                No technicians yet -{" "}
                <Link href="/admin/crew" className="text-safety font-semibold hover:underline">
                  add crew accounts
                </Link>{" "}
                to start assigning work orders.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function BoardCard({
  job,
  dragging,
  setDragging,
  compact,
}: {
  job: BoardJob;
  dragging: boolean;
  setDragging: (id: string | null) => void;
  compact?: boolean;
}) {
  return (
    <Link
      href={`/jobs/${job.id}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("jobId", job.id);
        setDragging(job.id);
      }}
      onDragEnd={() => setDragging(null)}
      className={clsx(
        "block border border-line rounded-md bg-white px-2 py-1.5 cursor-grab active:cursor-grabbing hover:border-ink transition select-none",
        dragging && "opacity-40",
        compact ? "text-xs" : "text-sm"
      )}
      title="Drag onto a technician's day, or click to open"
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <span className={clsx("w-1.5 h-1.5 rounded-full shrink-0", STATUS_DOT[job.status])} />
        <span className="font-medium truncate">{job.client_name}</span>
      </div>
      <div className="flex items-center gap-1.5 text-[11px]">
        {job.job_number && <span className="text-safety font-mono font-semibold">{formatWorkOrderNumber(job.job_number)}</span>}
        <span className="text-steel font-mono">{job.job_number ? "\u00b7 " : ""}{job.unit_count} units</span>
      </div>
    </Link>
  );
}
