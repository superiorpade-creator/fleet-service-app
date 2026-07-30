"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type { Customer, ImportedUnitRow, Profile } from "@/lib/types";

export function NewJobForm({
  crew,
  customers,
  initialCustomerId,
  initialClientName,
}: {
  crew: Profile[];
  customers: Customer[];
  initialCustomerId?: string;
  initialClientName?: string;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [customerId, setCustomerId] = useState<string | null>(initialCustomerId ?? null);
  const [clientName, setClientName] = useState(initialClientName ?? "");
  const [scheduledDate, setScheduledDate] = useState("");
  const [crewIds, setCrewIds] = useState<string[]>([]);
  const [units, setUnits] = useState<ImportedUnitRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  function handleCustomerSelect(id: string) {
    if (id === "") {
      setCustomerId(null);
      return;
    }
    setCustomerId(id);
    const match = customers.find((c) => c.id === id);
    if (match) setClientName(match.name);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setParsing(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/import", { method: "POST", body: formData });
    const body = await res.json();

    setParsing(false);

    if (!res.ok) {
      setError(body.error ?? "Couldn't parse that file.");
      setUnits([]);
      return;
    }

    setUnits(body.units);

    // If the sheet itself named the customer and the admin hasn't already
    // picked one or typed a name, use that instead of leaving it blank.
    if (body.suggestedClientName && !customerId && !clientName.trim()) {
      setClientName(body.suggestedClientName);
    }
  }

  function updateUnit(index: number, field: keyof ImportedUnitRow, value: string) {
    setUnits((prev) => prev.map((u, i) => (i === index ? { ...u, [field]: value } : u)));
  }

  function removeUnit(index: number) {
    setUnits((prev) => prev.filter((_, i) => i !== index));
  }

  function toggleCrew(id: string) {
    setCrewIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!clientName.trim()) {
      setError("Client name is required.");
      return;
    }

    setSubmitting(true);

    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: clientName,
        customer_id: customerId,
        scheduled_date: scheduledDate,
        crew_ids: crewIds,
        units,
      }),
    });

    const body = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setError(body.error ?? "Couldn't create the job.");
      return;
    }

    router.push(`/jobs/${body.job.id}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {/* Customer picker */}
      <div>
        <label className="block text-xs font-medium text-steel uppercase tracking-wide mb-1">
          Customer <span className="normal-case text-steel/70">(optional — links contact info + service reminders)</span>
        </label>
        <select
          value={customerId ?? ""}
          onChange={(e) => handleCustomerSelect(e.target.value)}
          className="w-full border border-line rounded px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-safety bg-white"
        >
          <option value="">— One-off job, no customer record —</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-steel mt-1">
          Don't see them?{" "}
          <a href="/admin/customers" target="_blank" rel="noopener noreferrer" className="text-safety font-semibold hover:underline">
            Add a new customer
          </a>{" "}
          (opens in a new tab).
        </p>
      </div>

      {/* Client + date */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-steel uppercase tracking-wide mb-1">
            Client Name
          </label>
          <input
            type="text"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            className="w-full border border-line rounded px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-safety"
            placeholder="Acme Logistics"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-steel uppercase tracking-wide mb-1">
            Scheduled Date <span className="normal-case text-steel/70">(optional)</span>
          </label>
          <input
            type="date"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
            className="w-full border border-line rounded px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-safety"
          />
          <p className="text-xs text-steel mt-1">
            Leave blank to drop it in the dispatch board's Unassigned tray and schedule it later.
          </p>
        </div>
      </div>

      {/* Crew assignment */}
      <div>
        <label className="block text-xs font-medium text-steel uppercase tracking-wide mb-2">
          Assign Crew
        </label>
        <div className="flex flex-wrap gap-2">
          {crew
            .filter((c) => c.role === "crew")
            .map((c) => (
              <button
                type="button"
                key={c.id}
                onClick={() => toggleCrew(c.id)}
                className={clsx(
                  "px-3 py-1.5 rounded-full text-sm border transition",
                  crewIds.includes(c.id)
                    ? "bg-ink text-white border-ink"
                    : "border-line text-steel hover:border-ink"
                )}
              >
                {c.full_name}
              </button>
            ))}
          {crew.filter((c) => c.role === "crew").length === 0 && (
            <p className="text-sm text-steel">No crew accounts yet — add one under Crew.</p>
          )}
        </div>
      </div>

      {/* Excel upload */}
      <div>
        <label className="block text-xs font-medium text-steel uppercase tracking-wide mb-2">
          Unit List (Excel)
        </label>
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-line rounded-lg p-6 text-center cursor-pointer hover:border-safety transition"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleFileChange}
          />
          <p className="text-sm text-steel">
            {parsing ? "Parsing…" : fileName ? fileName : "Click to upload a spreadsheet (.xlsx, .xls, .csv)"}
          </p>
        </div>
        {fileName && !parsing && units.length === 0 && !error && (
          <p className="text-xs text-steel mt-1.5">
            No units found in that file — that's fine for accounts where the truck list isn't known ahead
            of time. This job will start empty; crew add each truck as they service it.
          </p>
        )}
      </div>

      {/* Reviewable unit table */}
      {units.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-steel uppercase tracking-wide">
              Review Units ({units.length})
            </label>
          </div>
          <div className="border border-line rounded-lg overflow-hidden">
            <div className="grid grid-cols-[1fr_1fr_1fr_auto] bg-ink text-white text-xs font-semibold uppercase px-3 py-2">
              <span>Unit #</span>
              <span>Location</span>
              <span>Type</span>
              <span></span>
            </div>
            <div className="max-h-72 overflow-y-auto divide-y divide-line">
              {units.map((unit, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 px-3 py-1.5 items-center bg-white">
                  <input
                    value={unit.unit_number}
                    onChange={(e) => updateUnit(i, "unit_number", e.target.value)}
                    className="font-mono text-sm border-b border-transparent focus:border-safety focus:outline-none py-1 bg-transparent"
                  />
                  <input
                    value={unit.location ?? ""}
                    onChange={(e) => updateUnit(i, "location", e.target.value)}
                    className="text-sm border-b border-transparent focus:border-safety focus:outline-none py-1 bg-transparent"
                  />
                  <input
                    value={unit.unit_type ?? ""}
                    onChange={(e) => updateUnit(i, "unit_type", e.target.value)}
                    className="text-sm border-b border-transparent focus:border-safety focus:outline-none py-1 bg-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => removeUnit(i)}
                    className="text-alert text-xs font-semibold px-2"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {error && <p className="text-alert text-sm">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="bg-safety text-white font-semibold py-3.5 rounded-lg disabled:opacity-50 hover:opacity-90 transition"
      >
        {submitting ? "Scheduling…" : "Schedule Job"}
      </button>
    </form>
  );
}
