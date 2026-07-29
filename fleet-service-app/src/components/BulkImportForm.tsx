"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { guessClientNameFromFilename } from "@/lib/format";
import type { ImportedUnitRow } from "@/lib/types";

type RowStatus = "parsing" | "ready" | "error" | "creating" | "created";

interface BatchRow {
  key: string;
  fileName: string;
  clientName: string;
  units: ImportedUnitRow[];
  status: RowStatus;
  error?: string;
}

export function BulkImportForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<BatchRow[]>([]);
  const [scheduledDate, setScheduledDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const newRows: BatchRow[] = files.map((file) => ({
      key: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
      fileName: file.name,
      clientName: guessClientNameFromFilename(file.name),
      units: [],
      status: "parsing",
    }));

    setRows((prev) => [...prev, ...newRows]);

    // Parse every file in parallel; each is independent so one bad file
    // doesn't hold up the rest of the batch.
    files.forEach(async (file, i) => {
      const key = newRows[i].key;
      const formData = new FormData();
      formData.append("file", file);

      try {
        const res = await fetch("/api/import", { method: "POST", body: formData });
        const body = await res.json();

        if (!res.ok) {
          setRows((prev) => prev.map((r) => (r.key === key ? { ...r, status: "error", error: body.error } : r)));
          return;
        }

        setRows((prev) => prev.map((r) => (r.key === key ? { ...r, units: body.units, status: "ready" } : r)));
      } catch {
        setRows((prev) =>
          prev.map((r) => (r.key === key ? { ...r, status: "error", error: "Couldn't parse this file." } : r))
        );
      }
    });

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function updateClientName(key: string, name: string) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, clientName: name } : r)));
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  const readyRows = rows.filter((r) => r.status === "ready");
  const hasErrors = rows.some((r) => r.status === "error");

  async function handleCreateAll() {
    setSubmitError(null);
    setSubmitting(true);
    setRows((prev) => prev.map((r) => (r.status === "ready" ? { ...r, status: "creating" } : r)));

    const res = await fetch("/api/jobs/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobs: readyRows.map((r) => ({
          client_name: r.clientName,
          scheduled_date: scheduledDate || null,
          units: r.units,
        })),
      }),
    });

    const body = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setSubmitError(body.error ?? "Couldn't create the work orders.");
      setRows((prev) => prev.map((r) => (r.status === "creating" ? { ...r, status: "ready" } : r)));
      return;
    }

    const results: { client_name: string; ok: boolean; error?: string }[] = body.results;

    setRows((prev) => {
      let resultIdx = 0;
      return prev.map((r) => {
        if (r.status !== "creating") return r;
        const result = results[resultIdx++];
        return result?.ok
          ? { ...r, status: "created" }
          : { ...r, status: "error", error: result?.error ?? "Failed to create." };
      });
    });

    const anyCreated = results.some((r) => r.ok);
    if (anyCreated && results.every((r) => r.ok)) {
      // Clean sweep — head to the dispatch board to place the new work orders.
      router.push(scheduledDate ? "/calendar" : "/admin/schedule");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Upload zone */}
      <div
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-line rounded-lg p-8 text-center cursor-pointer hover:border-safety transition"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          multiple
          className="hidden"
          onChange={handleFilesSelected}
        />
        <p className="text-sm text-steel">
          Click to select spreadsheets — pick as many as you want, all at once
        </p>
      </div>

      {/* Optional shared date */}
      {rows.length > 0 && (
        <div className="max-w-xs">
          <label className="block text-xs font-medium text-steel uppercase tracking-wide mb-1">
            Scheduled Date <span className="normal-case text-steel/70">(optional, applies to all)</span>
          </label>
          <input
            type="date"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
            className="w-full border border-line rounded px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-safety"
          />
          <p className="text-xs text-steel mt-1">
            Leave blank to place all of these in the dispatch board's Unassigned tray instead.
          </p>
        </div>
      )}

      {/* Row list */}
      {rows.length > 0 && (
        <div className="border border-line rounded-lg overflow-hidden">
          <div className="grid grid-cols-[1fr_1fr_80px_90px_auto] bg-ink text-white text-xs font-semibold uppercase px-3 py-2">
            <span>File</span>
            <span>Customer Name</span>
            <span>Units</span>
            <span>Status</span>
            <span></span>
          </div>
          <div className="divide-y divide-line">
            {rows.map((row) => (
              <div
                key={row.key}
                className="grid grid-cols-[1fr_1fr_80px_90px_auto] gap-2 px-3 py-2 items-center bg-white"
              >
                <span className="text-xs text-steel truncate" title={row.fileName}>
                  {row.fileName}
                </span>
                <input
                  value={row.clientName}
                  onChange={(e) => updateClientName(row.key, e.target.value)}
                  disabled={row.status === "creating" || row.status === "created"}
                  className="text-sm font-medium border-b border-transparent focus:border-safety focus:outline-none py-1 bg-transparent disabled:opacity-60"
                />
                <span className="text-sm font-mono text-steel">{row.units.length || "—"}</span>
                <StatusBadge status={row.status} error={row.error} />
                <button
                  type="button"
                  onClick={() => removeRow(row.key)}
                  disabled={row.status === "creating" || row.status === "created"}
                  className="text-alert text-xs font-semibold px-2 disabled:opacity-30"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasErrors && (
        <p className="text-alert text-sm">
          Some files couldn't be parsed — fix or remove them before creating the rest.
        </p>
      )}
      {submitError && <p className="text-alert text-sm">{submitError}</p>}

      {readyRows.length > 0 && (
        <button
          onClick={handleCreateAll}
          disabled={submitting}
          className="self-start bg-safety text-white font-semibold px-5 py-3 rounded-lg disabled:opacity-50 hover:opacity-90 transition"
        >
          {submitting ? "Creating…" : `Create ${readyRows.length} Work Order${readyRows.length === 1 ? "" : "s"}`}
        </button>
      )}
    </div>
  );
}

function StatusBadge({ status, error }: { status: RowStatus; error?: string }) {
  const styles: Record<RowStatus, string> = {
    parsing: "bg-steel/10 text-steel",
    ready: "bg-go/10 text-go",
    error: "bg-alert/10 text-alert",
    creating: "bg-safety/10 text-safety",
    created: "bg-go/10 text-go",
  };
  const labels: Record<RowStatus, string> = {
    parsing: "Parsing…",
    ready: "Ready",
    error: "Error",
    creating: "Creating…",
    created: "Created",
  };

  return (
    <span
      className={clsx("text-[11px] font-semibold px-2 py-1 rounded-full text-center w-fit", styles[status])}
      title={error}
    >
      {labels[status]}
    </span>
  );
}
