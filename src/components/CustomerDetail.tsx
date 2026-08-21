"use client";

import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import type { Customer, Job, Unit } from "@/lib/types";

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

export function CustomerDetail({ customer, jobs, units }: { customer: Customer; jobs: Job[]; units: Unit[] }) {
  const [search, setSearch] = useState("");

  // Build a lookup from job id -> job, so each unit row (which only has a
  // job_id) can show which work order it was serviced on.
  const jobById = new Map(jobs.map((j) => [j.id, j]));

  const trimmed = search.trim().toLowerCase();
  const matchingUnits = trimmed ? units.filter((u) => u.unit_number.toLowerCase().includes(trimmed)) : [];

  // Group matches by unit number - the same truck shows up once per job
  // it's been on, so collapse those into one row per unit number with its
  // most recent serviced_at (if it's ever actually been checked off).
  const grouped = new Map<string, { unit: Unit; job: Job | undefined }[]>();
  for (const u of matchingUnits) {
    const list = grouped.get(u.unit_number) ?? [];
    list.push({ unit: u, job: jobById.get(u.job_id) });
    grouped.set(u.unit_number, list);
  }

  const results = Array.from(grouped.entries()).map(([unitNumber, entries]) => {
    const serviced = entries.filter((e) => e.unit.serviced_at);
    serviced.sort((a, b) => (b.unit.serviced_at! > a.unit.serviced_at! ? 1 : -1));
    return { unitNumber, lastServiced: serviced[0], visitCount: entries.length };
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Contact info + quick links */}
      <div className="bg-white border border-line rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          {customer.contact_name && <p className="font-medium">{customer.contact_name}</p>}
          {customer.phone && <p className="text-steel">{customer.phone}</p>}
          {customer.email && <p className="text-steel">{customer.email}</p>}
          {customer.address && <p className="text-steel">{customer.address}</p>}
        </div>
        <div className="flex gap-3">
          <Link href="/admin/customers" className="text-steel text-sm font-semibold hover:underline">
            Back to Customers
          </Link>
          <Link href={`/admin/customers/${customer.id}/send`} className="text-safety text-sm font-semibold hover:underline">
            Send PDFs
          </Link>
        </div>
      </div>

      {/* Unit search - "when was this truck last serviced" */}
      <div>
        <label className="block text-xs font-medium text-steel uppercase tracking-wide mb-1">
          Look Up a Unit
        </label>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Enter a unit #..."
          className="w-full border border-line rounded px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-safety"
        />

        {trimmed && (
          <div className="mt-3 border border-line rounded-lg overflow-hidden">
            {results.length === 0 && (
              <p className="text-sm text-steel px-3 py-4 text-center">
                No unit matching "{search}" has appeared on a work order for this customer.
              </p>
            )}
            {results.map(({ unitNumber, lastServiced, visitCount }) => (
              <div key={unitNumber} className="px-3 py-2.5 border-b border-line last:border-b-0 bg-white">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-semibold text-sm">{unitNumber}</span>
                  <span className="text-xs text-steel">
                    {visitCount} work order{visitCount === 1 ? "" : "s"}
                  </span>
                </div>
                {lastServiced ? (
                  <p className="text-sm text-go mt-0.5">
                    Last serviced {lastServiced.unit.serviced_at!.slice(0, 10)}
                    {lastServiced.job?.job_number ? ` - WO-${String(lastServiced.job.job_number).padStart(5, "0")}` : ""}
                  </p>
                ) : (
                  <p className="text-sm text-steel mt-0.5">Never marked serviced on record.</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Service date summary - every work order for this customer */}
      <div>
        <label className="block text-xs font-medium text-steel uppercase tracking-wide mb-2">
          Service History ({jobs.length})
        </label>
        <div className="border border-line rounded-lg overflow-hidden">
          {jobs.length === 0 && <p className="text-sm text-steel px-3 py-6 text-center">No work orders yet for this customer.</p>}
          {jobs.map((job) => (
            <Link
              key={job.id}
              href={`/admin/jobs/${job.id}/edit`}
              className="flex items-center justify-between px-3 py-2.5 border-b border-line last:border-b-0 bg-white hover:bg-paper transition text-sm"
            >
              <span className="font-mono text-steel">{job.scheduled_date ?? "Not yet scheduled"}</span>
              <span className={clsx("text-[11px] font-semibold px-2 py-1 rounded-full", STATUS_STYLE[job.status])}>
                {STATUS_LABEL[job.status]}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
