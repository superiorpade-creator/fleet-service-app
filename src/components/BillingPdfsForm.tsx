"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatWorkOrderNumber } from "@/lib/format";
import type { Job } from "@/lib/types";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function weekAgoISO() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

export function BillingPdfsForm() {
  const supabase = createClient();
  const [startDate, setStartDate] = useState(weekAgoISO());
  const [endDate, setEndDate] = useState(todayISO());
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadJobs() {
      setLoading(true);
      const { data } = await supabase
        .from("jobs")
        .select("*")
        .gte("scheduled_date", startDate)
        .lte("scheduled_date", endDate)
        .eq("status", "completed")
        .not("pdf_url", "is", null)
        .order("scheduled_date");

      if (!cancelled) {
        setJobs((data as Job[]) ?? []);
        setSelected(((data as Job[]) ?? []).map((j) => j.id));
        setLoading(false);
      }
    }

    loadJobs();
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate, supabase]);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleAll() {
    setSelected((prev) => (prev.length === jobs.length ? [] : jobs.map((j) => j.id)));
  }

  async function handleDownload() {
    setDownloading(true);
    setError(null);

    const res = await fetch("/api/jobs/combine-pdfs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_ids: selected }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't combine those PDFs.");
      setDownloading(false);
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Work-Orders-${startDate}-to-${endDate}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setDownloading(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 max-w-sm">
        <div>
          <label className="block text-xs font-medium text-steel uppercase tracking-wide mb-1">From</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-safety"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-steel uppercase tracking-wide mb-1">To</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-safety"
          />
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-steel">Loading...</p>
      ) : jobs.length === 0 ? (
        <p className="text-sm text-steel text-center py-6 border border-dashed border-line rounded-lg">
          No completed work orders with a generated PDF in that date range.
        </p>
      ) : (
        <div className="border border-line rounded-lg overflow-hidden">
          <div className="grid grid-cols-[auto_1fr_1fr_1fr] bg-ink text-white text-xs font-semibold uppercase px-3 py-2">
            <span>
              <button type="button" onClick={toggleAll} className="underline">
                {selected.length === jobs.length ? "Clear" : "All"}
              </button>
            </span>
            <span>Work Order</span>
            <span>Customer</span>
            <span>Date</span>
          </div>
          <div className="divide-y divide-line max-h-96 overflow-y-auto">
            {jobs.map((job) => (
              <label key={job.id} className="grid grid-cols-[auto_1fr_1fr_1fr] gap-2 px-3 py-2.5 items-center bg-white text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(job.id)}
                  onChange={() => toggle(job.id)}
                  className="w-4 h-4"
                />
                <span className="font-mono text-safety font-semibold">
                  {job.job_number ? formatWorkOrderNumber(job.job_number) : "WO-PENDING"}
                </span>
                <span className="truncate">{job.client_name}</span>
                <span className="text-steel font-mono text-xs">{job.scheduled_date ?? "-"}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-alert text-sm">{error}</p>}

      {jobs.length > 0 && (
        <button
          onClick={handleDownload}
          disabled={selected.length === 0 || downloading}
          className="self-start bg-safety text-white font-semibold px-5 py-3 rounded-lg disabled:opacity-50 hover:opacity-90 transition"
        >
          {downloading ? "Combining..." : `Download Combined PDF (${selected.length})`}
        </button>
      )}
    </div>
  );
}
