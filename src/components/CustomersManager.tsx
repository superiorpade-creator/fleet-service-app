"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { FREQUENCY_LABEL } from "@/lib/service-status";
import type { CustomerFrequency, CustomerWithStatus, ImportedUnitRow, ServiceStatus } from "@/lib/types";

const STATUS_LABEL: Record<ServiceStatus, string> = {
  overdue: "Overdue",
  due_soon: "Due Soon",
  on_track: "On Track",
  no_history: "Not Serviced Yet",
};

const STATUS_STYLE: Record<ServiceStatus, string> = {
  overdue: "bg-alert/10 text-alert",
  due_soon: "bg-safety/10 text-safety",
  on_track: "bg-go/10 text-go",
  no_history: "bg-steel/10 text-steel",
};

interface FormState {
  id: string | null; // null = creating new
  name: string;
  contact_name: string;
  phone: string;
  email: string;
  address: string;
  frequency: CustomerFrequency;
  notes: string;
  defaultUnits: ImportedUnitRow[];
}

const EMPTY_FORM: FormState = {
  id: null,
  name: "",
  contact_name: "",
  phone: "",
  email: "",
  address: "",
  frequency: "monthly",
  notes: "",
  defaultUnits: [],
};

export function CustomersManager({ initialCustomers }: { initialCustomers: CustomerWithStatus[] }) {
  const [customers, setCustomers] = useState(initialCustomers);
  const [form, setForm] = useState<FormState | null>(null); // null = form closed
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [uploadingUnits, setUploadingUnits] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [testSending, setTestSending] = useState(false);
  const [defaultUnitSearch, setDefaultUnitSearch] = useState("");

  // Pair each default unit with its real index before filtering, so the
  // existing update/remove handlers (which operate on array index) still
  // target the right row even when the visible list is narrowed by search.
  const visibleDefaultUnits = (form?.defaultUnits ?? [])
    .map((unit, i) => ({ unit, i }))
    .filter(({ unit }) => unit.unit_number.toLowerCase().includes(defaultUnitSearch.trim().toLowerCase()));

  async function handleSendTestAlert() {
    setTestSending(true);
    setTestStatus(null);

    const res = await fetch("/api/customers/send-test-alert", { method: "POST" });
    const body = await res.json();
    setTestSending(false);

    if (!res.ok) {
      setTestStatus(`Failed: ${body.error ?? "unknown error"}`);
      return;
    }

    setTestStatus(
      body.overdue === 0
        ? `Sent - no accounts are currently overdue, so it was a "you're all caught up" test text to ${body.texted} number(s).`
        : `Sent - ${body.overdue} overdue account${body.overdue === 1 ? "" : "s"} texted to ${body.texted} number(s).`
    );
  }

  function openNew() {
    setForm(EMPTY_FORM);
    setError(null);
    setDefaultUnitSearch("");
  }

  async function openEdit(c: CustomerWithStatus) {
    setForm({
      id: c.id,
      name: c.name,
      contact_name: c.contact_name ?? "",
      phone: c.phone ?? "",
      email: c.email ?? "",
      address: c.address ?? "",
      frequency: c.frequency,
      notes: c.notes ?? "",
      defaultUnits: [],
    });
    setError(null);
    setDefaultUnitSearch("");
    setLoadingUnits(true);

    const res = await fetch(`/api/customers/${c.id}/units`);
    const body = await res.json();
    setLoadingUnits(false);

    if (res.ok) {
      setForm((prev) =>
        prev
          ? {
              ...prev,
              defaultUnits: (body.units ?? []).map((u: any) => ({
                unit_number: u.unit_number,
                location: u.location ?? "",
                unit_type: u.unit_type ?? "",
              })),
            }
          : prev
      );
    }
  }

  function updateDefaultUnit(i: number, field: keyof ImportedUnitRow, value: string) {
    setForm((prev) => (prev ? { ...prev, defaultUnits: prev.defaultUnits.map((u, idx) => (idx === i ? { ...u, [field]: value } : u)) } : prev));
  }

  function addDefaultUnit() {
    setForm((prev) => (prev ? { ...prev, defaultUnits: [...prev.defaultUnits, { unit_number: "", location: "", unit_type: "" }] } : prev));
  }

  function removeDefaultUnit(i: number) {
    setForm((prev) => (prev ? { ...prev, defaultUnits: prev.defaultUnits.filter((_, idx) => idx !== i) } : prev));
  }

  // Lets the admin upload the customer's fleet spreadsheet once, straight
  // onto their profile, instead of typing every truck in by hand.
  async function handleUploadDefaultUnits(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingUnits(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/import", { method: "POST", body: formData });
    const body = await res.json();
    setUploadingUnits(false);

    if (!res.ok) {
      setError(body.error ?? "Couldn't parse that file.");
      return;
    }

    setForm((prev) => (prev ? { ...prev, defaultUnits: [...prev.defaultUnits, ...body.units] } : prev));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSave() {
    if (!form) return;
    if (!form.name.trim()) {
      setError("Customer name is required.");
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      name: form.name,
      contact_name: form.contact_name,
      phone: form.phone,
      email: form.email,
      address: form.address,
      frequency: form.frequency,
      notes: form.notes,
    };

    const res = form.id
      ? await fetch(`/api/customers/${form.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch("/api/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

    const body = await res.json();

    if (!res.ok) {
      setSaving(false);
      setError(body.error ?? "Couldn't save that customer.");
      return;
    }

    const customerId = form.id ?? body.customer.id;

    // Save the default unit list too - for a brand new customer this
    // creates it for the first time; for an existing one it replaces
    // whatever was there (add a truck, remove one that's been sold).
    const cleanUnits = form.defaultUnits.filter((u) => u.unit_number.trim().length > 0);
    const unitsRes = await fetch(`/api/customers/${customerId}/units`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ units: cleanUnits }),
    });

    setSaving(false);

    if (!unitsRes.ok) {
      setError("Customer saved, but the default unit list didn't save. Try editing again.");
      return;
    }

    if (form.id) {
      setCustomers((prev) =>
        prev.map((c) => (c.id === form.id ? { ...c, ...payload, contact_name: payload.contact_name || null, phone: payload.phone || null, email: payload.email || null, address: payload.address || null, notes: payload.notes || null } : c))
      );
    } else {
      setCustomers((prev) =>
        [
          ...prev,
          {
            ...body.customer,
            last_service_date: null,
            next_due_date: null,
            status: "no_history" as ServiceStatus,
            days_overdue: 0,
          },
        ].sort((a, b) => a.name.localeCompare(b.name))
      );
    }

    setForm(null);
  }

  async function handleDelete(c: CustomerWithStatus) {
    if (!confirm(`Delete ${c.name}? Past work orders keep their record but lose the customer link.`)) return;

    const res = await fetch(`/api/customers/${c.id}`, { method: "DELETE" });
    if (res.ok) setCustomers((prev) => prev.filter((x) => x.id !== c.id));
  }

  return (
    <div className="flex flex-col gap-6">
      {!form && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={openNew}
            className="bg-safety text-white font-semibold px-4 py-2.5 rounded hover:opacity-90 transition"
          >
            + New Customer
          </button>
          <button
            onClick={handleSendTestAlert}
            disabled={testSending}
            className="border border-line text-steel font-semibold px-4 py-2.5 rounded hover:bg-paper disabled:opacity-50 transition"
          >
            {testSending ? "Sending..." : "Send Test Alert"}
          </button>
          {testStatus && <span className="text-xs text-steel">{testStatus}</span>}
        </div>
      )}

      {form && (
        <div className="bg-white border border-line rounded-lg p-4 flex flex-col gap-3">
          <p className="font-semibold text-sm">{form.id ? "Edit Customer" : "New Customer"}</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Customer / Company Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            <Field label="Contact Name" value={form.contact_name} onChange={(v) => setForm({ ...form, contact_name: v })} />
            <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} type="tel" />
            <Field label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} type="email" />
          </div>

          <Field label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />

          <div>
            <label className="block text-xs font-medium text-steel uppercase tracking-wide mb-1">
              Service Frequency
            </label>
            <div className="flex gap-2">
              {(["weekly", "biweekly", "monthly"] as CustomerFrequency[]).map((f) => (
                <button
                  type="button"
                  key={f}
                  onClick={() => setForm({ ...form, frequency: f })}
                  className={clsx(
                    "px-3 py-1.5 rounded-full text-sm border transition",
                    form.frequency === f ? "bg-ink text-white border-ink" : "border-line text-steel hover:border-ink"
                  )}
                >
                  {FREQUENCY_LABEL[f]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-steel uppercase tracking-wide mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-safety"
              placeholder="Gate code, preferred contact time, anything the crew should know..."
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1 gap-3">
              <label className="text-xs font-medium text-steel uppercase tracking-wide shrink-0">
                Default Units ({form.defaultUnits.length})
              </label>
              <input
                type="text"
                value={defaultUnitSearch}
                onChange={(e) => setDefaultUnitSearch(e.target.value)}
                placeholder="Search unit #..."
                className="flex-1 max-w-[200px] border border-line rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-safety"
              />
              <button type="button" onClick={addDefaultUnit} className="text-safety text-sm font-semibold shrink-0">
                + Add Unit
              </button>
            </div>
            <p className="text-xs text-steel mb-2">
              Their usual fleet. New jobs for this customer auto-fill from this list instead of needing a
              fresh spreadsheet every time. Remove a truck here once it's sold; doesn't affect past work orders.
            </p>

            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-line rounded-lg p-4 text-center cursor-pointer hover:border-safety transition mb-3"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleUploadDefaultUnits}
              />
              <p className="text-sm text-steel">
                {uploadingUnits ? "Parsing..." : "Click to upload their fleet spreadsheet (.xlsx, .xls, .csv)"}
              </p>
            </div>

            {loadingUnits ? (
              <p className="text-sm text-steel">Loading...</p>
            ) : (
              <div className="border border-line rounded-lg overflow-hidden">
                <div className="grid grid-cols-[1fr_1fr_1fr_auto] bg-ink text-white text-xs font-semibold uppercase px-3 py-2">
                  <span>Unit #</span>
                  <span>Location</span>
                  <span>Type</span>
                  <span></span>
                </div>
                <div className="max-h-56 overflow-y-auto divide-y divide-line">
                  {visibleDefaultUnits.length === 0 && form.defaultUnits.length > 0 && (
                    <p className="text-xs text-steel px-3 py-4 text-center">
                      No units match "{defaultUnitSearch}".
                    </p>
                  )}
                  {visibleDefaultUnits.map(({ unit, i }) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 px-3 py-1.5 items-center bg-white">
                      <input
                        value={unit.unit_number}
                        onChange={(e) => updateDefaultUnit(i, "unit_number", e.target.value)}
                        className="font-mono text-sm border-b border-transparent focus:border-safety focus:outline-none py-1 bg-transparent"
                      />
                      <input
                        value={unit.location ?? ""}
                        onChange={(e) => updateDefaultUnit(i, "location", e.target.value)}
                        className="text-sm border-b border-transparent focus:border-safety focus:outline-none py-1 bg-transparent"
                      />
                      <input
                        value={unit.unit_type ?? ""}
                        onChange={(e) => updateDefaultUnit(i, "unit_type", e.target.value)}
                        className="text-sm border-b border-transparent focus:border-safety focus:outline-none py-1 bg-transparent"
                      />
                      <button type="button" onClick={() => removeDefaultUnit(i)} className="text-alert text-xs font-semibold px-2">
                        Remove
                      </button>
                    </div>
                  ))}
                  {form.defaultUnits.length === 0 && (
                    <p className="text-xs text-steel px-3 py-4 text-center">
                      No default units yet - add some, or leave empty for rotating-fleet accounts.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {error && <p className="text-alert text-sm">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-safety text-white font-semibold px-4 py-2 rounded disabled:opacity-50 hover:opacity-90 transition"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              onClick={() => setForm(null)}
              className="px-4 py-2 rounded border border-line text-steel hover:bg-paper transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="border border-line rounded-lg overflow-hidden">
        <div className="grid grid-cols-[1.3fr_1.3fr_0.9fr_1fr_0.9fr_auto] bg-ink text-white text-xs font-semibold uppercase px-3 py-2">
          <span>Customer</span>
          <span>Contact</span>
          <span>Frequency</span>
          <span>Last Serviced</span>
          <span>Status</span>
          <span></span>
        </div>
        <div className="divide-y divide-line">
          {customers.map((c) => (
            <div key={c.id} className="grid grid-cols-[1.3fr_1.3fr_0.9fr_1fr_0.9fr_auto] gap-2 px-3 py-3 items-center bg-white text-sm">
              <Link href={`/admin/customers/${c.id}`} className="font-medium truncate text-safety hover:underline">{c.name}</Link>
              <span className="text-steel text-xs truncate">
                {c.contact_name || c.phone || c.email ? (
                  <>
                    {c.contact_name && <span className="block">{c.contact_name}</span>}
                    {c.phone && <span className="block">{c.phone}</span>}
                  </>
                ) : (
                  "-"
                )}
              </span>
              <span className="text-xs">{FREQUENCY_LABEL[c.frequency]}</span>
              <span className="text-xs font-mono text-steel">{c.last_service_date ?? "-"}</span>
              <span className={clsx("text-[11px] font-semibold px-2 py-1 rounded-full w-fit", STATUS_STYLE[c.status])}>
                {c.status === "overdue" ? `${STATUS_LABEL[c.status]} (${c.days_overdue}d)` : STATUS_LABEL[c.status]}
              </span>
              <div className="flex gap-2">
                <Link href={`/admin/customers/${c.id}/send`} className="text-ink text-xs font-semibold">
                  Send PDFs
                </Link>
                <button onClick={() => openEdit(c)} className="text-safety text-xs font-semibold">
                  Edit
                </button>
                <button onClick={() => handleDelete(c)} className="text-alert text-xs font-semibold">
                  Delete
                </button>
              </div>
            </div>
          ))}
          {customers.length === 0 && (
            <p className="text-sm text-steel px-3 py-6 text-center">No customers yet - add your first one above.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-steel uppercase tracking-wide mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-safety"
      />
    </div>
  );
}
