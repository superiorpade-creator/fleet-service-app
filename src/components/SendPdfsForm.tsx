"use client";

import { useState } from "react";
import { formatWorkOrderNumber } from "@/lib/format";
import type { Customer, Job } from "@/lib/types";

export function SendPdfsForm({ customer, jobs }: { customer: Customer; jobs: Job[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleAll() {
    setSelected((prev) => (prev.length === jobs.length ? [] : jobs.map((j) => j.id)));
  }

  // Combines every selected work order's PDF into one file - the same
  // result as scanning a stack of paper work orders into a single packet.
  async function handleDownload() {
    setDownloading(true);
    setError(null);

    const res = await fetch(`/api/customers/${customer.id}/combine-pdfs`, {
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
    const safeName = customer.name.replace(/[^a-z0-9]+/gi, "-");
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName}-Work-Orders-${new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setDownloading(false);
  }

  function handleEmail() {
    const selectedJobs = jobs.filter((j) => selected.includes(j.id));
    const list = selectedJobs
      .map((j) => `- ${j.job_number ? formatWorkOrderNumber(j.job_number) : "WO-PENDING"} (${j.scheduled_date ?? "no date"})`)
      .join("\n");

    const subject = `Work Orders - ${customer.name}`;
    const body = `Hi,\n\nAttached are the following work orders:\n\n${list}\n\nThanks,\n`;

    const mailto = `mailto:${customer.email ?? ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
  }

  if (jobs.length === 0) {
    return (
      <p className="text-sm text-steel text-center py-6 border border-dashed border-line rounded-lg">
        No completed work orders with a generated PDF yet for this customer.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {!customer.email && (
        <p className="text-sm text-alert bg-alert/5 border border-alert/30 rounded-lg p-3">
          This customer doesn't have an email on file yet - add one on their profile before sending.
        </p>
      )}

      <div className="border border-line rounded-lg overflow-hidden">
        <div className="grid grid-cols-[auto_1fr_1fr] bg-ink text-white text-xs font-semibold uppercase px-3 py-2">
          <span>
            <button type="button" onClick={toggleAll} className="underline">
              {selected.length === jobs.length ? "Clear" : "All"}
            </button>
          </span>
          <span>Work Order</span>
          <span>Date</span>
        </div>
        <div className="divide-y divide-line">
          {jobs.map((job) => (
            <label key={job.id} className="grid grid-cols-[auto_1fr_1fr] gap-2 px-3 py-2.5 items-center bg-white text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={selected.includes(job.id)}
                onChange={() => toggle(job.id)}
                className="w-4 h-4"
              />
              <span className="font-mono text-safety font-semibold">
                {job.job_number ? formatWorkOrderNumber(job.job_number) : "WO-PENDING"}
              </span>
              <span className="text-steel font-mono text-xs">{job.scheduled_date ?? "-"}</span>
            </label>
          ))}
        </div>
      </div>

      {error && <p className="text-alert text-sm">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={handleDownload}
          disabled={selected.length === 0 || downloading}
          className="flex-1 bg-white border border-line text-ink font-semibold py-3 rounded-lg disabled:opacity-50 hover:bg-paper transition"
        >
          {downloading ? "Combining..." : `Download Combined PDF (${selected.length || 0})`}
        </button>
        <button
          onClick={handleEmail}
          disabled={selected.length === 0 || !customer.email}
          className="flex-1 bg-safety text-white font-semibold py-3 rounded-lg disabled:opacity-50 hover:opacity-90 transition"
        >
          Open Email in Outlook
        </button>
      </div>
      <p className="text-xs text-steel">
        Download the combined PDF first, then use Email - Outlook will open with the customer's
        address, a subject line, and a list of what's included. Drag the downloaded file into the
        email before sending.
      </p>
    </div>
  );
}
