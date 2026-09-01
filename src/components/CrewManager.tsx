"use client";

import { useState } from "react";
import type { Profile } from "@/lib/types";

export function CrewManager({ initialCrew }: { initialCrew: Profile[] }) {
  const [crew, setCrew] = useState(initialCrew);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [phoneDrafts, setPhoneDrafts] = useState<Record<string, string>>({});
  const [savingPhoneId, setSavingPhoneId] = useState<string | null>(null);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setInviting(true);

    const res = await fetch("/api/crew", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: fullName, email }),
    });
    const body = await res.json();
    setInviting(false);

    if (!res.ok) {
      setError(body.error ?? "Couldn't send the invite.");
      return;
    }

    setMessage(`Invite sent to ${email}.`);
    setFullName("");
    setEmail("");
  }

  async function handleRemove(id: string, name: string) {
    if (!confirm(`Remove ${name}'s account? They'll lose access immediately.`)) return;

    const res = await fetch(`/api/crew/${id}`, { method: "DELETE" });
    if (res.ok) setCrew((prev) => prev.filter((c) => c.id !== id));
  }

  function phoneValue(c: Profile) {
    return phoneDrafts[c.id] ?? c.phone ?? "";
  }

  async function handlePhoneBlur(c: Profile) {
    const draft = phoneDrafts[c.id];
    if (draft === undefined || draft === (c.phone ?? "")) return;

    setSavingPhoneId(c.id);
    const res = await fetch(`/api/crew/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: draft.trim() || null }),
    });
    setSavingPhoneId(null);

    if (res.ok) {
      setCrew((prev) => prev.map((p) => (p.id === c.id ? { ...p, phone: draft.trim() || null } : p)));
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={handleInvite} className="bg-white border border-line rounded-lg p-4 flex flex-col gap-3">
        <p className="font-semibold text-sm">Invite a crew member</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            placeholder="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="border border-line rounded px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-safety"
          />
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border border-line rounded px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-safety"
          />
        </div>
        {error && <p className="text-alert text-sm">{error}</p>}
        {message && <p className="text-go text-sm">{message}</p>}
        <button
          type="submit"
          disabled={inviting}
          className="self-start bg-safety text-white font-semibold px-4 py-2.5 rounded disabled:opacity-50 hover:opacity-90 transition"
        >
          {inviting ? "Sending…" : "Send Invite"}
        </button>
      </form>

      <div>
        <p className="font-semibold text-sm mb-2">All accounts</p>
        <div className="flex flex-col divide-y divide-line border border-line rounded-lg overflow-hidden">
          {crew.map((c) => (
            <div key={c.id} className="flex items-center justify-between bg-white px-4 py-3 gap-3">
              <div className="min-w-0">
                <p className="font-medium text-sm">{c.full_name}</p>
                <p className="text-xs text-steel uppercase">{c.role}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="tel"
                  placeholder="Phone for texts"
                  value={phoneValue(c)}
                  onChange={(e) => setPhoneDrafts((prev) => ({ ...prev, [c.id]: e.target.value }))}
                  onBlur={() => handlePhoneBlur(c)}
                  className="w-40 text-sm border border-line rounded px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-safety"
                />
                {savingPhoneId === c.id && <span className="text-xs text-steel">Saving…</span>}
                {c.role !== "admin" && (
                  <button
                    onClick={() => handleRemove(c.id, c.full_name)}
                    className="text-alert text-sm font-semibold"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
