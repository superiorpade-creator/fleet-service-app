"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type { Customer, EditableUnitRow, Job, Profile, Unit } from "@/lib/types";
import { formatWorkOrderNumber } from "@/lib/format";

export function EditJobForm({
  job,
  initialUnits,
  crew,
  customers,
  assignedCrewIds,
}: {
  job: Job;
  initialUnits: Unit[];
  crew: Profile[];
  customers: Customer[];
  assignedCrewIds: string[];
}) {
  const router = useRouter();

  const [customerId, setCustomerId] = useState<string | null>(job.customer_id);
  const [clientName, setClientName] = useState(job.client_name);
  const [scheduledDate, setScheduledDate] = useState(job.scheduled_date ?? "");
  const [crewIds, setCrewIds] = useState<string[]>(assignedCrewIds);
  const [units, setUnits] = useState<EditableUnitRow[]>(
    initialUnits.map((u) => ({
      id: u.id,
      unit_number: u.unit_number,
      location: u.location ?? "",
      unit_type: u.unit_type ?? "",
      serviced: u.serviced,
    }))
  );
  const [pdfUrl, setPdfUrl] = useState(job.pdf_url);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isCompleted = job.status === "completed";

  function toggleCrew(id: string) {
    setCrewIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  function updateUnit(i: number, field: "unit_number" | "location" | "unit_type", value: string) {
    setUnits((prev) => prev.map((u, idx) => (idx === i ? { ...u, [field]: value } : u)));
  }

  function toggleUnitServiced(i: number) {
    setUnits((prev) => prev.map((u, idx) => (idx === i ? { ...u, serviced: !u.serviced } : u)));
  }

  function addUnit() {
    setUnits((prev) => [...prev, { unit_number: "", location: "", unit_type: "", serviced: false }]);
  }

  function removeUnit(i: number) {
    setUnits((prev) => prev.filter((_, idx) => idx !== i));
  }

  // Returns true on success - shared by "Save Changes" and "Save & Generate PDF".
  async function saveChanges(): Promise<boolean> {
    setSaving(true);
    setError(null);
    setMessage(null);

    const detailsRes = await fetch(`/api/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: clientName,
        customer_id: customerId,
        scheduled_date: scheduledDate || null,
        crew_ids: crewIds,
      }),
    });

    const cleanUnits = units.filter((u) => u.unit_number.trim().length > 0);
    const unitsRes = await fetch(`/api/jobs/${job.id}/units`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ units: cleanUnits }),
    });

    setSaving(false);

    if (!detailsRes.ok || !unitsRes.ok) {
      setError("Something didn't save. Check the fields and try again.");
      return false;
    }

    return true;
  }

  async function handleSave() {
    const ok = await saveChanges();
    if (ok) {
      setMessage("Saved.");
      router.refresh();
    }
  }

  async function handleGeneratePdf() {
    setGenerating(true);
    setError(null);
    setMessage(null);

    // Save first so the PDF reflects whatever's currently in the form,
    // not whatever was last saved.
    const saved = await saveChanges();
    if (!saved) {
      setGenerating(false);
      return;
    }

    const res = await fetch(`/api/jobs/${job.id}/generate-pdf`, { method: "POST" });
    const body = await res.json();
    setGenerating(false);

    if (!res.ok) {
      setError(body.error ?? "Couldn't generate the PDF.");
      return;
    }

    setPdfUrl(body.pdf_path);
    setMessage("PDF generated.");
    router.refresh();
  }

  async function handleReopen() {
    if (!confirm("Send this back to the crew? They'll need to mark it complete again before you can regenerate the PDF."))
      return;

    setSaving(true);
    const res = await fetch(`/api/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reopen: true }),
    });
    setSaving(false);

    if (res.ok) router.refresh();
  }

  async function handleDelete() {
    if (!confirm(`Delete this job for ${job.client_name}? This can't be undone.`)) return;

    const res = await fetch(`/api/jobs/${job.id}`, { method: "DELETE" });
    if (res.ok) router.push("/calendar");
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <span className="inline-block text-xs font-mono font-semibold text-safety bg-safety/10 px-2 py-1 rounded">
          {job.job_number ? formatWorkOrderNumber(job.job_number) : "Not yet scheduled - no WO# assigned yet"}
        </span>
      </div>

      {isCompleted && (
        <div className="bg-go/5 border border-go/30 rounded-lg p-4 flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-sm">Crew marked this work order complete.</p>
            <p className="text-xs text-steel mt-0.5">
              {pdfUrl
                ? "PDF generated - edit below and click Save & Generate PDF again if you make changes."
                : "Review the checklist and fix anything needed below, then generate the PDF when you're ready."}
            </p>
          </div>
          <button
            onClick={handleReopen}
            disabled={saving}
            className="shrink-0 border border-alert text-alert text-sm font-semibold px-3 py-2 rounded hover:bg-alert/5 transition"
          >
            Send Back to Crew
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-steel uppercase tracking-wide mb-1">
            Customer
          </label>
          <select
            value={customerId ?? ""}
            onChange={(e) => {
              const id = e.target.value || null;
              setCustomerId(id);
              const match = customers.find((c) => c.id === id);
              if (match) setClientName(match.name);
            }}
            className="w-full border border-line rounded px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-safety bg-white"
          >
            <option value="">- No customer record linked -</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-steel uppercase tracking-wide mb-1">
            Client Name
          </label>
          <input
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            className="w-full border border-line rounded px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-safety"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-steel uppercase tracking-wide mb-1">
            Scheduled Date
          </label>
          <input
            type="date"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
            className="w-full border border-line rounded px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-safety"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-steel uppercase tracking-wide mb-2">
          Assigned Crew
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
                  crewIds.includes(c.id) ? "bg-ink text-white border-ink" : "border-line text-steel hover:border-ink"
                )}
              >
                {c.full_name}
              </button>
            ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-steel uppercase tracking-wide">
            Units ({units.length})
          </label>
          <button type="button" onClick={addUnit} className="text-safety text-sm font-semibold">
            + Add Unit
          </button>
        </div>
        <div className="border border-line rounded-lg overflow-hidden">
          <div className="grid grid-cols-[auto_1fr_1fr_1fr_auto] bg-ink text-white text-xs font-semibold uppercase px-3 py-2">
            <span>Serviced</span>
            <span>Unit #</span>
            <span>Location</span>
            <span>Type</span>
            <span></span>
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-line">
            {units.map((unit, i) => (
              <div key={i} className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-2 px-3 py-1.5 items-center bg-white">
                <button
                  type="button"
                  onClick={() => toggleUnitServiced(i)}
                  aria-pressed={!!unit.serviced}
                  className={clsx(
                    "w-6 h-6 rounded border-2 flex items-center justify-center text-xs font-bold transition shrink-0",
                    unit.serviced ? "bg-go border-go text-white" : "border-line text-transparent"
                  )}
                >
                  OK
                </button>
                <input
                  value={unit.unit_number}
                  onChange={(e) => updateUnit(i, "unit_number", e.target.value)}
                  className="font-mono text-sm border-b border-transparent focus:border-safety focus:outline-none py-1 bg-transparent"
                />
                <input
                  value={unit.location}
                  onChange={(e) => updateUnit(i, "location", e.target.value)}
                  className="text-sm border-b border-transparent focus:border-safety focus:outline-none py-1 bg-transparent"
                />
                <input
                  value={unit.unit_type}
                  onChange={(e) => updateUnit(i, "unit_type", e.target.value)}
                  className="text-sm border-b border-transparent focus:border-safety focus:outline-none py-1 bg-transparent"
                />
                <button type="button" onClick={() => removeUnit(i)} className="text-alert text-xs font-semibold px-2">
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {error && <p className="text-alert text-sm">{error}</p>}
      {message && <p className="text-go text-sm">{message}</p>}

      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleSave}
          disabled={saving || generating}
          className="flex-1 min-w-[140px] bg-white border border-line text-ink font-semibold py-3 rounded-lg disabled:opacity-50 hover:bg-paper transition"
        >
          {saving && !generating ? "Saving..." : "Save Changes"}
        </button>

        {isCompleted && (
          <button
            onClick={handleGeneratePdf}
            disabled={saving || generating}
            className="flex-1 min-w-[200px] bg-safety text-white font-semibold py-3 rounded-lg disabled:opacity-50 hover:opacity-90 transition"
          >
            {generating ? "Generating..." : pdfUrl ? "Save & Regenerate PDF" : "Save & Generate PDF"}
          </button>
        )}

        {pdfUrl && (
          <a
            href={`/api/jobs/${job.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center px-4 py-3 rounded-lg border border-line text-steel font-semibold hover:bg-paper transition"
          >
            View PDF
          </a>
        )}

        <button
          onClick={handleDelete}
          className="px-4 py-3 rounded-lg border border-alert text-alert font-semibold hover:bg-alert/5 transition"
        >
          Delete Job
        </button>
      </div>
    </div>
  );
}
