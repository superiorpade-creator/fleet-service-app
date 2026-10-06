"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { addDaysISO, mondayOf, stopsForWeek, type Stop } from "@/lib/bentkey";

function money(n: number): string {
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
function localKey(d: Date): string {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function fmtDate(s: string): string {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / 86400000);
}

const WEEK_LABELS = ["This week", "Next week", "The week after"];

export function BentkeyManager({ initialStops }: { initialStops: Stop[] }) {
  const [stops, setStops] = useState<Stop[]>(initialStops);
  const [today, setToday] = useState("");
  const [weekChoice, setWeekChoice] = useState(0);
  const [scheduled, setScheduled] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [madeJob, setMadeJob] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newEvery, setNewEvery] = useState("3");
  const [newDue, setNewDue] = useState("");

  useEffect(() => {
    const t = localKey(new Date());
    setToday(t);
    setScheduled(mondayOf(t));
    setNewDue(mondayOf(t));
  }, []);

  const thisMonday = today ? mondayOf(today) : "";
  const weekStart = thisMonday ? addDaysISO(thisMonday, weekChoice * 7) : "";
  const active = stops.filter((s) => s.active);
  const overdue = thisMonday ? active.filter((s) => s.next_due < thisMonday) : [];
  const dueNow = thisMonday
    ? active.filter((s) => s.next_due >= thisMonday && s.next_due <= addDaysISO(thisMonday, 6))
    : [];
  const week = weekStart ? stopsForWeek(stops, weekStart) : [];
  const weekDollars = week.reduce((s, d) => s + d.stop.amount, 0);
  const perFour = active.reduce((s, x) => s + (x.amount * 4) / x.every_weeks, 0);
  const sorted = [...stops].sort(
    (a, b) => Number(b.active) - Number(a.active) || a.next_due.localeCompare(b.next_due) || a.name.localeCompare(b.name)
  );

  async function seed() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/bentkey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "seed", week_start: thisMonday }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) return setError(body.error ?? "Couldn't load the list.");
    setStops(body.stops as Stop[]);
  }

  async function addStop(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!newName.trim()) return setError("Enter the stop's name.");
    if (!(Number(newAmount) >= 0) || newAmount === "") return setError("Enter a dollar amount.");
    if (!newDue) return setError("Pick the next due date.");
    setBusy(true);
    const res = await fetch("/api/bentkey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add", name: newName, amount: Number(newAmount), every_weeks: Number(newEvery), next_due: newDue }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) return setError(body.error ?? "Couldn't add that stop.");
    setStops((prev) => [...prev, body.stop as Stop]);
    setNewName("");
    setNewAmount("");
  }

  async function save(id: string, fields: Partial<Pick<Stop, "name" | "amount" | "every_weeks" | "next_due" | "active">>) {
    setError(null);
    const previous = stops;
    setStops((prev) => prev.map((s) => (s.id === id ? { ...s, ...fields } : s)));
    const res = await fetch("/api/bentkey", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, fields }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setStops(previous);
      setError(body.error ?? "Couldn't save that change.");
    }
  }

  async function remove(s: Stop) {
    if (!confirm("Remove " + s.name + " from the Bentkey list? Past work orders keep their checklist.")) return;
    const res = await fetch("/api/bentkey", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: s.id }),
    });
    if (res.ok) setStops((prev) => prev.filter((x) => x.id !== s.id));
    else setError("Couldn't remove that stop.");
  }

  async function createWeek() {
    setBusy(true);
    setError(null);
    setNotice(null);
    setMadeJob(null);
    const res = await fetch("/api/bentkey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create_week", week_start: weekStart, scheduled_date: scheduled }),
    });
    const body = await res.json();
    setBusy(false);
    if (body.job_id) setMadeJob(body.job_id);
    if (!res.ok) return setError(body.error ?? "Couldn't create the work order.");
    setNotice(
      "Created a work order with " + body.stops + " stops (" + money(body.dollars) + ")" +
        (body.overdue > 0 ? ", " + body.overdue + " carried over from earlier." : ".")
    );
  }

  if (stops.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <div className="bg-white border border-line rounded-lg p-5 max-w-xl">
          <p className="font-semibold mb-1">No Bentkey list yet</p>
          <p className="text-sm text-steel mb-3">
            Load your 28 Bentkey stops. The every-3-weeks ones are spread over three weeks so each week carries about
            the same dollars, and you can change any due date afterward.
          </p>
          <button
            onClick={seed}
            disabled={busy || !thisMonday}
            className="bg-brand text-white font-semibold px-4 py-2.5 rounded disabled:opacity-50 hover:opacity-90 transition"
          >
            {busy ? "Loading..." : "Load the Bentkey list"}
          </button>
        </div>
        {error && <p className="text-alert text-sm">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={clsx("rounded-lg px-4 py-3 border", overdue.length > 0 ? "bg-white border-alert" : "bg-white border-line")}>
          <div className="text-[11px] uppercase tracking-wide text-steel">Overdue</div>
          <div className={clsx("text-xl font-semibold", overdue.length > 0 ? "text-alert" : "text-go")}>
            {overdue.length} {overdue.length === 1 ? "stop" : "stops"}
          </div>
          <div className="text-xs text-steel">{money(overdue.reduce((s, x) => s + x.amount, 0))} still to make up</div>
        </div>
        <div className="bg-white border border-line rounded-lg px-4 py-3">
          <div className="text-[11px] uppercase tracking-wide text-steel">Due this week</div>
          <div className="text-xl font-semibold text-brand">{dueNow.length} stops</div>
          <div className="text-xs text-steel">{money(dueNow.reduce((s, x) => s + x.amount, 0))}</div>
        </div>
        <div className="bg-white border border-line rounded-lg px-4 py-3">
          <div className="text-[11px] uppercase tracking-wide text-steel">Active stops</div>
          <div className="text-xl font-semibold text-brand">{active.length}</div>
          <div className="text-xs text-steel">{stops.length - active.length} paused</div>
        </div>
        <div className="bg-white border border-line rounded-lg px-4 py-3">
          <div className="text-[11px] uppercase tracking-wide text-steel">Worth per 4 weeks</div>
          <div className="text-xl font-semibold text-brand">{money(Math.round(perFour))}</div>
          <div className="text-xs text-steel">if every stop is serviced</div>
        </div>
      </div>

      {error && <p className="text-alert text-sm">{error}</p>}
      {notice && (
        <p className="text-go text-sm">
          {notice}{" "}
          {madeJob && (
            <Link href={"/admin/jobs/" + madeJob + "/edit"} className="underline font-semibold">
              Open it to assign a crew
            </Link>
          )}
        </p>
      )}

      <div className="bg-white border border-line rounded-lg p-4 flex flex-col gap-3">
        <p className="font-semibold text-sm">Create a weekly work order</p>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-steel uppercase tracking-wide mb-1">Week</label>
            <select
              value={weekChoice}
              onChange={(e) => {
                const v = Number(e.target.value);
                setWeekChoice(v);
                if (thisMonday) setScheduled(addDaysISO(thisMonday, v * 7));
              }}
              className="border border-line rounded px-3 py-2 text-sm bg-white"
            >
              {WEEK_LABELS.map((l, i) => (
                <option key={l} value={i}>
                  {l}
                  {weekStart && thisMonday ? " (" + fmtDate(addDaysISO(thisMonday, i * 7)) + ")" : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-steel uppercase tracking-wide mb-1">Scheduled day</label>
            <input
              type="date"
              value={scheduled}
              min={weekStart}
              max={weekStart ? addDaysISO(weekStart, 6) : undefined}
              onChange={(e) => setScheduled(e.target.value)}
              className="border border-line rounded px-3 py-2 text-sm"
            />
          </div>
          <button
            onClick={createWeek}
            disabled={busy || week.length === 0}
            className="bg-brand text-white font-semibold px-4 py-2 rounded text-sm disabled:opacity-50 hover:opacity-90 transition"
          >
            {busy ? "Creating..." : "Create work order"}
          </button>
        </div>
        <p className="text-xs text-steel">
          {week.length === 0
            ? "No stops are due that week."
            : week.length + " stops, " + money(weekDollars) + ". " + week.filter((d) => d.overdue).length + " carried over from earlier weeks."}{" "}
          Assign a crew afterward the usual way. Checking a stop off rolls it forward when the work order closes; a
          stop left unchecked stays due.
        </p>
      </div>

      <div>
        <p className="font-semibold text-sm mb-2">All stops</p>
        <div className="border border-line rounded-lg overflow-x-auto bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-steel uppercase text-[11px] border-b border-line">
                <th className="py-2 px-3">Stop</th>
                <th className="py-2 px-3">Amount</th>
                <th className="py-2 px-3">Every</th>
                <th className="py-2 px-3">Next due</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3">Active</th>
                <th className="py-2 px-3" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => {
                const late = thisMonday && s.active && s.next_due < thisMonday;
                const thisWk = thisMonday && s.active && s.next_due >= thisMonday && s.next_due <= addDaysISO(thisMonday, 6);
                return (
                  <tr key={s.id} className={clsx("border-b border-line last:border-0", !s.active && "opacity-50")}>
                    <td className="py-1.5 px-3 font-medium">{s.name}</td>
                    <td className="py-1.5 px-3">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={s.amount}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v) && v >= 0 && v !== s.amount) save(s.id, { amount: v });
                        }}
                        className="w-20 border border-line rounded px-2 py-1 text-sm"
                      />
                    </td>
                    <td className="py-1.5 px-3">
                      <select
                        value={s.every_weeks}
                        onChange={(e) => save(s.id, { every_weeks: Number(e.target.value) })}
                        className="border border-line rounded px-2 py-1 text-sm bg-white"
                      >
                        {[1, 2, 3, 4, 5, 6].map((n) => (
                          <option key={n} value={n}>
                            {n} wk{n > 1 ? "s" : ""}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1.5 px-3">
                      <input
                        type="date"
                        defaultValue={s.next_due}
                        onBlur={(e) => {
                          if (e.target.value && e.target.value !== s.next_due) save(s.id, { next_due: e.target.value });
                        }}
                        className="border border-line rounded px-2 py-1 text-sm"
                      />
                    </td>
                    <td className={clsx("py-1.5 px-3 text-xs", late ? "text-alert font-semibold" : thisWk ? "text-brand font-semibold" : "text-steel")}>
                      {!s.active
                        ? "Paused"
                        : late
                          ? daysBetween(s.next_due, today) + " days overdue"
                          : thisWk
                            ? "Due this week"
                            : "Due " + fmtDate(s.next_due)}
                    </td>
                    <td className="py-1.5 px-3">
                      <input type="checkbox" checked={s.active} onChange={(e) => save(s.id, { active: e.target.checked })} />
                    </td>
                    <td className="py-1.5 px-3 text-right">
                      <button onClick={() => remove(s)} className="text-alert text-xs font-semibold">
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <form onSubmit={addStop} className="bg-white border border-line rounded-lg p-4 grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-steel uppercase tracking-wide mb-1">New stop</label>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Account name"
            className="w-full border border-line rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-steel uppercase tracking-wide mb-1">Amount</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={newAmount}
            onChange={(e) => setNewAmount(e.target.value)}
            placeholder="75"
            className="w-full border border-line rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-steel uppercase tracking-wide mb-1">Every / first due</label>
          <div className="flex gap-2">
            <select value={newEvery} onChange={(e) => setNewEvery(e.target.value)} className="border border-line rounded px-2 py-2 text-sm bg-white">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n} wk{n > 1 ? "s" : ""}
                </option>
              ))}
            </select>
            <input type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)} className="flex-1 min-w-0 border border-line rounded px-2 py-2 text-sm" />
          </div>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="bg-brand text-white font-semibold px-4 py-2 rounded text-sm disabled:opacity-50 hover:opacity-90 transition"
        >
          Add stop
        </button>
      </form>
    </div>
  );
}
