"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ChecklistItem } from "./ChecklistItem";
import type { Job, Unit } from "@/lib/types";

export function JobChecklist({
  job,
  initialUnits,
  isAdmin,
}: {
  job: Job;
  initialUnits: Unit[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [units, setUnits] = useState(initialUnits);
  const [pdfUrl, setPdfUrl] = useState(job.pdf_url);
  const [closing, setClosing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newUnitNumber, setNewUnitNumber] = useState("");
  const [adding, setAdding] = useState(false);

  const isClosed = job.status === "completed";
  const servicedCount = units.filter((u) => u.serviced).length;
  const allServiced = units.length > 0 && servicedCount === units.length;

  const progressPct = useMemo(
    () => (units.length ? Math.round((servicedCount / units.length) * 100) : 0),
    [servicedCount, units.length]
  );

  async function ensureInProgress() {
    if (job.status === "scheduled") {
      await supabase.from("jobs").update({ status: "in_progress", started_at: new Date().toISOString() }).eq("id", job.id);
    }
  }

  async function toggleUnit(unit: Unit) {
    if (isClosed) return;

    const nextServiced = !unit.serviced;
    setUnits((prev) => prev.map((u) => (u.id === unit.id ? { ...u, serviced: nextServiced } : u)));
    await ensureInProgress();

    const { error } = await supabase
      .from("units")
      .update({
        serviced: nextServiced,
        serviced_at: nextServiced ? new Date().toISOString() : null,
      })
      .eq("id", unit.id);

    if (error) {
      // Roll back on failure
      setUnits((prev) => prev.map((u) => (u.id === unit.id ? { ...u, serviced: unit.serviced } : u)));
      setError("Couldn't save that check - check your connection and try again.");
    }
  }

  async function updateNotes(unit: Unit, notes: string) {
    setUnits((prev) => prev.map((u) => (u.id === unit.id ? { ...u, notes } : u)));
    await supabase.from("units").update({ notes }).eq("id", unit.id);
  }

  // For accounts where the truck list isn't known ahead of time (rotating
  // fleets), crew add a unit right when they service it - adding IS the
  // record of it being done, so it's inserted already checked off.
  async function handleAddUnit(e: React.FormEvent) {
    e.preventDefault();
    const unit_number = newUnitNumber.trim();
    if (!unit_number) return;

    setAdding(true);
    setError(null);
    await ensureInProgress();

    const { data, error } = await supabase
      .from("units")
      .insert({
        job_id: job.id,
        unit_number,
        serviced: true,
        serviced_at: new Date().toISOString(),
        sort_order: units.length,
      })
      .select()
      .single();

    setAdding(false);

    if (error || !data) {
      setError("Couldn't add that truck - check your connection and try again.");
      return;
    }

    setUnits((prev) => [...prev, data as Unit]);
    setNewUnitNumber("");
  }

  async function handleMarkComplete() {
    setClosing(true);
    setError(null);

    const res = await fetch(`/api/jobs/${job.id}/close`, { method: "POST" });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't mark this complete. Try again.");
      setClosing(false);
      return;
    }

    router.refresh();
    setClosing(false);
  }

  async function handleGeneratePdf() {
    setGenerating(true);
    setError(null);

    const res = await fetch(`/api/jobs/${job.id}/generate-pdf`, { method: "POST" });
    const body = await res.json();
    setGenerating(false);

    if (!res.ok) {
      setError(body.error ?? "Couldn't generate the PDF.");
      return;
    }

    setPdfUrl(body.pdf_path);
    router.refresh();
  }

  return (
    <div>
      {/* Progress bar */}
      {units.length > 0 && (
        <div className="mb-4">
          <div className="flex justify-between text-sm mb-1">
            <span className="font-medium">
              {servicedCount} of {units.length} serviced
            </span>
            <span className="text-steel">{progressPct}%</span>
          </div>
          <div className="h-2 bg-line rounded-full overflow-hidden">
            <div className="h-full bg-go transition-all duration-300" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 mb-4">
        {units.map((unit) => (
          <ChecklistItem key={unit.id} unit={unit} disabled={isClosed} onToggle={toggleUnit} onNotesChange={updateNotes} />
        ))}
        {units.length === 0 && !isClosed && (
          <p className="text-sm text-steel text-center py-4 border border-dashed border-line rounded-lg">
            No trucks yet - add each one below as you service it.
          </p>
        )}
      </div>

      {/* Add a truck on the spot - for accounts where the list isn't known ahead of time */}
      {!isClosed && (
        <form onSubmit={handleAddUnit} className="flex gap-2 mb-6">
          <input
            type="text"
            value={newUnitNumber}
            onChange={(e) => setNewUnitNumber(e.target.value)}
            placeholder="Truck # just serviced"
            className="flex-1 border border-line rounded-lg px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-safety"
          />
          <button
            type="submit"
            disabled={adding || !newUnitNumber.trim()}
            className="bg-ink text-white font-semibold px-5 rounded-lg disabled:opacity-40 hover:opacity-90 transition"
          >
            {adding ? "Adding..." : "+ Add"}
          </button>
        </form>
      )}

      {error && <p className="text-alert text-sm mb-3">{error}</p>}

      {/* Not yet marked complete - crew (or admin) check things off and complete it */}
      {!isClosed && (
        <button
          onClick={handleMarkComplete}
          disabled={!allServiced || closing}
          className="w-full bg-safety text-white font-semibold py-4 rounded-lg text-base disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition"
        >
          {closing
            ? "Marking complete..."
            : allServiced
            ? "Mark Work Order Complete"
            : units.length === 0
            ? "Add at least one truck to complete"
            : `Check off all units to complete (${servicedCount}/${units.length})`}
        </button>
      )}

      {/* Marked complete but no PDF yet - admin reviews/edits, then generates it */}
      {isClosed && !pdfUrl && isAdmin && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-steel">
            Marked complete by crew. Fix anything needed from{" "}
            <a href={`/admin/jobs/${job.id}/edit`} className="text-safety font-semibold hover:underline">
              Edit Job
            </a>
            , then generate the PDF.
          </p>
          <button
            onClick={handleGeneratePdf}
            disabled={generating}
            className="w-full bg-safety text-white font-semibold py-4 rounded-lg text-base disabled:opacity-50 hover:opacity-90 transition"
          >
            {generating ? "Generating..." : "Generate Completion PDF"}
          </button>
        </div>
      )}

      {isClosed && !pdfUrl && !isAdmin && (
        <p className="text-sm text-steel text-center py-3">Marked complete - an admin will finalize the paperwork.</p>
      )}

      {/* PDF exists - anyone can download it */}
      {isClosed && pdfUrl && (
        <a
          href={`/api/jobs/${job.id}/pdf`}
          className="block w-full text-center bg-ink text-white font-semibold py-4 rounded-lg hover:opacity-90 transition"
        >
          Download Completion PDF
        </a>
      )}
    </div>
  );
}
