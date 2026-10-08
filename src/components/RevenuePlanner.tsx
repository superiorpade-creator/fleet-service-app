"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { WeekWorkOrdersDialog, type CustomerOption } from "./WeekWorkOrdersDialog";

export interface RevenueRow {
  id: string;
  name: string;
  amount: number;
  scheduled_date: string; // YYYY-MM-DD
  series_id: string;
  job_id: string | null; // the work order created from this visit, if any
  missed: boolean; // marked as a visit that didn't happen
  done: boolean; // a Bentkey stop marked as serviced
  job_status?: string | null; // status of that work order
}

const WEEKLY_GOAL = 11000;
const DAY_MS = 24 * 60 * 60 * 1000;

// ---- date helpers (plain calendar dates, no time zones involved) ----
function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function dateKey(d: Date): string {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function shiftDate(s: string, days: number): string {
  const d = parseDate(s);
  d.setDate(d.getDate() + days);
  return dateKey(d);
}
function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / DAY_MS);
}
function weekStartKey(s: string): string {
  const d = parseDate(s);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return dateKey(d);
}
function fmtMoney(n: number): string {
  return (
    "$" + n.toLocaleString("en-US", { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })
  );
}
function fmtShort(s: string): string {
  return parseDate(s).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ---- chip colors by account group (later groups win, same as before) ----
const BENTKEY_NAMES = new Set([
  "Samuel", "Vena", "Produce Ryeco", "USA", "Steel", "Days Bev", "DNF", "Phillys Best",
  "Scrub Daddy", "Cooseman", "WB NJ", "ITU", "Packer Av", "Dry Ice", "TA Strat",
  "Amycel", "Mushroom", "Tri State", "Katzman", "Wellington", "Crw", "Unlabeled",
  "Unlabeled ($495)", "Philabun", "Olivio", "Durato",
]);
const WB_NAMES = new Set(["Ryder WB NJ", "WB (new)", "WB NJ", "Wb Mason", "Wb Mason (Somer)"]);
const RED_NAMES = new Set(["Viggiano", "Essex", "Pensk KP (Ess)"]);

function isBentkey(name: string, amount: number): boolean {
  if (BENTKEY_NAMES.has(name)) return true;
  if (name.includes("(Bentkey)") || name.includes("(BK)")) return true;
  if (name.toLowerCase().startsWith("bentkey")) return true;
  if (name === "CTDI" && amount === 150) return true;
  if (name === "Exp Cab" && amount === 62) return true;
  return false;
}

function chipColors(name: string, amount: number): string {
  if (RED_NAMES.has(name)) return "bg-[#fbdad7] border-[#ecb0aa] text-[#7a1f16]";
  if (name.toLowerCase().includes("fedex")) return "bg-[#e8dcf5] border-[#c9a8e8] text-[#4a1a6b]";
  if (WB_NAMES.has(name)) return "bg-[#d4e8fa] border-[#a3cbef] text-[#0d3c66]";
  if (name.toLowerCase().includes("iron mt")) return "bg-[#fff3c4] border-[#e8d16b] text-[#5c4a03]";
  if (isBentkey(name, amount)) return "bg-[#dff3df] border-[#b6e0b6] text-[#235a23]";
  return "bg-[#fdf6e3] border-[#e8d9a8] text-[#5c4a03]";
}

const REPEAT_OPTIONS = [
  { value: "0", label: "Just once" },
  { value: "1", label: "Every week" },
  { value: "2", label: "Every 2 weeks" },
  { value: "3", label: "Every 3 weeks" },
  { value: "4", label: "Every 4 weeks" },
];

export function RevenuePlanner({
  initialRows,
  customers,
  initialLinks,
  yearEnd,
  startingTotal,
  bentkeyPending,
}: {
  initialRows: RevenueRow[];
  customers: CustomerOption[];
  initialLinks: Record<string, string | null>;
  yearEnd: string;
  startingTotal: number;
  bentkeyPending: number;
}) {
  const [rows, setRows] = useState<RevenueRow[]>(initialRows);
  const [repeatSeries, setRepeatSeries] = useState(true);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<RevenueRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [amountDraft, setAmountDraft] = useState<{ id: string; value: string } | null>(null);

  // A half-typed amount should not carry over to the next visit you open.
  useEffect(() => {
    if (!selected) setAmountDraft(null);
  }, [selected]);
  const [error, setError] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, string | null>>(initialLinks);
  const [dialogWeek, setDialogWeek] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Today is read after the page loads, so the server and browser never disagree about it.
  const [todayKey, setTodayKey] = useState("");
  useEffect(() => {
    setTodayKey(dateKey(new Date()));
  }, []);

  // add-account form
  const [newName, setNewName] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newFirstDate, setNewFirstDate] = useState("");
  const [newEvery, setNewEvery] = useState("2");
  const [newUntil, setNewUntil] = useState(() =>
    initialRows.reduce((max, r) => (r.scheduled_date > max ? r.scheduled_date : max), "")
  );

  const { byDate, weekTotals, windowStart, windowEnd } = useMemo(() => {
    const byDate: Record<string, RevenueRow[]> = {};
    const weekTotals: Record<string, number> = {};
    let windowStart = "";
    let windowEnd = "";
    for (const r of rows) {
      (byDate[r.scheduled_date] ??= []).push(r);
      const wk = weekStartKey(r.scheduled_date);
      weekTotals[wk] = (weekTotals[wk] ?? 0) + r.amount;
      if (!windowStart || r.scheduled_date < windowStart) windowStart = r.scheduled_date;
      if (!windowEnd || r.scheduled_date > windowEnd) windowEnd = r.scheduled_date;
    }
    return { byDate, weekTotals, windowStart, windowEnd };
  }, [rows]);

  const stats = useMemo(() => {
    let total = 0;
    for (const r of rows) total += r.amount;
    const fullWeeks: number[] = [];
    for (const k of Object.keys(weekTotals)) {
      if (k >= windowStart && shiftDate(k, 6) <= (windowEnd < yearEnd ? windowEnd : yearEnd)) fullWeeks.push(weekTotals[k]);
    }
    const avg = fullWeeks.length ? fullWeeks.reduce((a, b) => a + b, 0) / fullWeeks.length : 0;
    return { total, avg };
  }, [rows, weekTotals, windowStart, windowEnd, yearEnd]);

  // A visit is missed once its date has passed and it was either marked missed
  // here or its work order still isn't completed.
  const missed = useMemo(() => {
    if (todayKey === "") return { list: [] as RevenueRow[], total: 0 };
    const list = rows
      .filter(
        (r) =>
          r.scheduled_date < todayKey &&
          (r.missed ||
            (!!r.job_id && r.job_status !== "completed") ||
            (r.series_id.startsWith("bk::") && !r.done && !(r.job_id && r.job_status === "completed")))
      )
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date) || a.name.localeCompare(b.name));
    return { list, total: list.reduce((s, r) => s + r.amount, 0) };
  }, [rows, todayKey]);
  const missedIds = useMemo(() => new Set(missed.list.map((r) => r.id)), [missed]);

  // Revenue still booked on or before year end, against the starting schedule.
  const yearBooked = useMemo(
    () => rows.filter((r) => r.scheduled_date <= yearEnd).reduce((s, r) => s + r.amount, 0),
    [rows, yearEnd]
  );

  const accountSummary = useMemo(() => {
    const byName: Record<string, { count: number; total: number }> = {};
    for (const r of rows) {
      const e = (byName[r.name] ??= { count: 0, total: 0 });
      e.count += 1;
      e.total += r.amount;
    }
    return Object.entries(byName).sort((a, b) => b[1].total - a[1].total);
  }, [rows]);

  const months = useMemo(() => {
    if (!windowStart) return [];
    const out: { year: number; month: number; daysInMonth: number; firstDow: number; name: string }[] = [];
    const start = parseDate(windowStart);
    const end = parseDate(windowEnd);
    let cur = new Date(start.getFullYear(), start.getMonth(), 1);
    const last = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cur <= last) {
      const year = cur.getFullYear();
      const month = cur.getMonth();
      out.push({
        year,
        month,
        daysInMonth: new Date(year, month + 1, 0).getDate(),
        firstDow: new Date(year, month, 1).getDay(),
        name: cur.toLocaleString("en-US", { month: "long", year: "numeric" }),
      });
      cur = new Date(year, month + 1, 1);
    }
    return out;
  }, [windowStart, windowEnd]);

  // ---- actions ----
  async function handleSeed() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/revenue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "seed" }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "Couldn't load the starting schedule.");
      return;
    }
    setRows((body.rows as RevenueRow[]).map((r) => ({ ...r, amount: Number(r.amount) })));
  }

  async function handleDrop(e: React.DragEvent, key: string) {
    e.preventDefault();
    setDragOverKey(null);
    const id = e.dataTransfer.getData("text/plain");
    const acc = rows.find((r) => r.id === id);
    if (!acc || acc.scheduled_date === key) return;

    const delta = daysBetween(acc.scheduled_date, key);
    const moving = repeatSeries ? rows.filter((r) => r.series_id === acc.series_id) : [acc];
    const moves = moving.map((r) => ({ id: r.id, scheduled_date: shiftDate(r.scheduled_date, delta) }));
    const moveMap = new Map(moves.map((m) => [m.id, m.scheduled_date]));

    const previous = rows;
    setRows(
      rows.map((r) => (moveMap.has(r.id) ? { ...r, scheduled_date: moveMap.get(r.id) as string, missed: false, done: false } : r))
    );
    setError(null);

    const res = await fetch("/api/revenue", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moves }),
    });
    if (!res.ok) {
      setRows(previous);
      setError("Couldn't save that move. It was put back - try again.");
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const every = Number(newEvery);
    if (!newName.trim()) return setError("Enter the account name.");
    if (!(Number(newAmount) > 0)) return setError("Enter an amount greater than zero.");
    if (!newFirstDate) return setError("Pick the first service date.");
    if (every > 0 && !newUntil) return setError("Pick a last date for the repeat.");

    setBusy(true);
    const res = await fetch("/api/revenue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "add",
        name: newName,
        amount: Number(newAmount),
        first_date: newFirstDate,
        every_weeks: every,
        until: newUntil,
      }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "Couldn't add that account.");
      return;
    }
    const added = (body.rows as RevenueRow[]).map((r) => ({ ...r, amount: Number(r.amount) }));
    setRows((prev) => [...prev, ...added]);
    setNewName("");
    setNewAmount("");
    setNewFirstDate("");
  }

  async function saveAmount(ids: string[]) {
    if (!selected) return;
    const raw = amountDraft && amountDraft.id === selected.id ? amountDraft.value : String(selected.amount);
    const value = Math.round(Number(raw) * 100) / 100;
    if (raw.trim() === "" || !Number.isFinite(value) || value < 0 || value > 100000) {
      setError("Enter an amount between $0 and $100,000.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/revenue", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: { ids, value } }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Couldn't save that. Try again.");
      return;
    }
    const changed = new Set(ids);
    setRows((prev) => prev.map((r) => (changed.has(r.id) ? { ...r, amount: value } : r)));
    setAmountDraft(null);
    setSelected(null);
  }

  async function removeRows(ids: string[]) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/revenue", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Couldn't remove that. Try again.");
      return;
    }
    const gone = new Set(ids);
    setRows((prev) => prev.filter((r) => !gone.has(r.id)));
    setSelected(null);
  }

  async function setDoneFlag(id: string) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/revenue", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mark: { ids: [id], done: true } }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Couldn't save that. Try again.");
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, done: true, missed: false } : r)));
    setSelected(null);
  }

  async function moveBentkey() {
    if (!confirm("Move the Bentkey stops onto this calendar? Their old calendar entries from their first due date on are replaced.")) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/revenue/bentkey", { method: "POST" });
    const body = await res.json();
    if (!res.ok) {
      setBusy(false);
      setError(body.error ?? "Couldn't move the Bentkey stops.");
      return;
    }
    window.location.reload();
  }

  async function setMissedFlag(id: string, value: boolean) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/revenue", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mark: { ids: [id], missed: value } }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Couldn't save that. Try again.");
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, missed: value, done: value ? false : r.done } : r)));
    setSelected(null);
  }

  function exportCSV() {
    const lines = [["Date", "Account", "Amount"]];
    [...rows]
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
      .forEach((r) => lines.push([r.scheduled_date, r.name, String(r.amount)]));
    const csv = lines.map((l) => l.map((v) => (v.includes(",") ? '"' + v + '"' : v)).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "fleet_revenue_schedule.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---- empty state: nothing loaded yet ----
  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <div className="bg-white border border-line rounded-lg p-5 max-w-xl">
          <p className="font-semibold mb-1">No schedule loaded yet</p>
          <p className="text-sm text-steel mb-3">
            Load your starting schedule (Aug 10 to Dec 31, 2026) to get going. After that, everything you add,
            move, or remove is saved here.
          </p>
          <button
            onClick={handleSeed}
            disabled={busy}
            className="bg-brand text-white font-semibold px-4 py-2.5 rounded disabled:opacity-50 hover:opacity-90 transition"
          >
            {busy ? "Loading..." : "Load starting schedule"}
          </button>
        </div>
        {error && <p className="text-alert text-sm">{error}</p>}
      </div>
    );
  }

  const selectedLater = selected
    ? rows.filter((r) => r.series_id === selected.series_id && r.scheduled_date >= selected.scheduled_date)
    : [];
  const selectedSeries = selected ? rows.filter((r) => r.series_id === selected.series_id) : [];
  const weekKeys = Object.keys(weekTotals).sort();
  const pendingCount = (wk: string) =>
    rows.filter((r) => !r.job_id && weekStartKey(r.scheduled_date) === wk).length;

  return (
    <div className="flex flex-col gap-6">
      {/* stats + controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="bg-white border border-line rounded-lg px-4 py-2.5 min-w-[150px]">
          <div className="text-[11px] uppercase tracking-wide text-steel">Avg / week (full weeks to {fmtShort(yearEnd)})</div>
          <div className={clsx("text-xl font-semibold", stats.avg >= WEEKLY_GOAL ? "text-go" : "text-alert")}>
            {fmtMoney(Math.round(stats.avg))}
          </div>
        </div>
        <div className="bg-white border border-line rounded-lg px-4 py-2.5 min-w-[150px]">
          <div className="text-[11px] uppercase tracking-wide text-steel">Total</div>
          <div className="text-xl font-semibold text-brand">{fmtMoney(Math.round(stats.total))}</div>
        </div>
        <div className="bg-white border border-line rounded-lg px-4 py-2.5 min-w-[150px]">
          <div className="text-[11px] uppercase tracking-wide text-steel">Weekly goal</div>
          <div className="text-xl font-semibold text-brand">{fmtMoney(WEEKLY_GOAL)}</div>
        </div>
        <div className="bg-white border border-line rounded-lg px-4 py-2.5 min-w-[150px]">
          <div className="text-[11px] uppercase tracking-wide text-steel">Booked through {fmtShort(yearEnd)}</div>
          <div className="text-xl font-semibold text-brand">{fmtMoney(Math.round(yearBooked))}</div>
          <div className={clsx("text-[10px] font-medium", yearBooked >= startingTotal ? "text-go" : "text-alert")}>
            {(yearBooked >= startingTotal ? "+" : "") + fmtMoney(Math.round(yearBooked - startingTotal))} vs starting plan
          </div>
        </div>
        <button
          onClick={exportCSV}
          className="border border-brand text-brand font-semibold px-4 py-2.5 rounded hover:bg-paper transition text-sm"
        >
          Export CSV
        </button>
        <label className="flex items-center gap-2 text-sm text-steel">
          <input type="checkbox" checked={repeatSeries} onChange={(e) => setRepeatSeries(e.target.checked)} />
          Repeat a move across this account&apos;s whole series
        </label>
      </div>

      <p className="text-xs text-steel -mt-3">
        Drag with a mouse (desktop or laptop) to move an account. Click an account to remove it. With the box above
        checked, moving one Tuesday to Wednesday moves all of that account&apos;s Tuesdays; uncheck it to move just
        one day.
      </p>

      {error && <p className="text-alert text-sm">{error}</p>}
      {notice && <p className="text-go text-sm">{notice}</p>}

      {/* missed visits to make up */}
      <div className="bg-white border border-line rounded-lg p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
          <h2 className="font-semibold text-sm">Missed visits to make up</h2>
          <span className={clsx("text-xs", missed.list.length > 0 ? "text-alert font-semibold" : "text-go")}>
            {missed.list.length === 0
              ? "None missed"
              : missed.list.length + " visit(s), " + fmtMoney(Math.round(missed.total)) + " still to make up"}
          </span>
        </div>
        {missed.list.length > 0 && (
          <div className="max-h-56 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-steel uppercase text-[11px]">
                  <th className="py-1.5 pr-2">Was due</th>
                  <th className="py-1.5 pr-2">Account</th>
                  <th className="py-1.5 pr-2 text-right">Amount</th>
                  <th className="py-1.5 text-right">Days late</th>
                </tr>
              </thead>
              <tbody>
                {missed.list.map((r) => (
                  <tr key={r.id} onClick={() => setSelected(r)} className="border-t border-line cursor-pointer hover:bg-paper">
                    <td className="py-1.5 pr-2">{fmtShort(r.scheduled_date)}</td>
                    <td className="py-1.5 pr-2">{r.name}</td>
                    <td className="py-1.5 pr-2 text-right font-semibold text-alert">{fmtMoney(r.amount)}</td>
                    <td className="py-1.5 text-right">{daysBetween(r.scheduled_date, todayKey)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-steel mt-2">
          A visit turns red once its date has passed and it was marked missed here, or its work order isn&apos;t
          completed. Drag a red visit to the day you&apos;ll make it up (uncheck the repeat box first so only that
          visit moves). Click one to mark it missed or done.
        </p>
      </div>

      {bentkeyPending > 0 && (
        <div className="bg-white border border-line rounded-lg p-4 flex flex-wrap items-center gap-3">
          <p className="text-sm flex-1 min-w-[240px]">
            <span className="font-semibold">{bentkeyPending} Bentkey stops are still in the old list.</span> Move them
            onto this calendar to schedule each one by day. Their old calendar entries from their first due date on are
            replaced.
          </p>
          <button
            onClick={moveBentkey}
            disabled={busy}
            className="bg-brand text-white font-semibold px-4 py-2 rounded text-sm disabled:opacity-50 hover:opacity-90 transition"
          >
            {busy ? "Moving..." : "Move Bentkey onto the calendar"}
          </button>
        </div>
      )}

      {/* add an account */}
      <form
        onSubmit={handleAdd}
        className="bg-white border border-line rounded-lg p-4 grid grid-cols-1 sm:grid-cols-6 gap-3 items-end"
      >
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-steel uppercase tracking-wide mb-1">Account</label>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            placeholder="New account name"
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
            className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            placeholder="200"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-steel uppercase tracking-wide mb-1">First date</label>
          <input
            type="date"
            value={newFirstDate}
            onChange={(e) => setNewFirstDate(e.target.value)}
            className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-steel uppercase tracking-wide mb-1">Repeat</label>
          <select
            value={newEvery}
            onChange={(e) => setNewEvery(e.target.value)}
            className="w-full border border-line rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand"
          >
            {REPEAT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 items-end">
          {newEvery !== "0" && (
            <div className="flex-1">
              <label className="block text-xs font-medium text-steel uppercase tracking-wide mb-1">Through</label>
              <input
                type="date"
                value={newUntil}
                onChange={(e) => setNewUntil(e.target.value)}
                className="w-full border border-line rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
          )}
          <button
            type="submit"
            disabled={busy}
            className="bg-brand text-white font-semibold px-4 py-2 rounded text-sm disabled:opacity-50 hover:opacity-90 transition"
          >
            Add
          </button>
        </div>
      </form>

      {/* group color key */}
      <div className="flex flex-wrap gap-2 text-[11px]">
        <span className="px-2 py-0.5 rounded border bg-[#dff3df] border-[#b6e0b6] text-[#235a23]">Bentkey</span>
        <span className="px-2 py-0.5 rounded border bg-[#fff3c4] border-[#e8d16b] text-[#5c4a03]">Iron Mt</span>
        <span className="px-2 py-0.5 rounded border bg-[#d4e8fa] border-[#a3cbef] text-[#0d3c66]">WB</span>
        <span className="px-2 py-0.5 rounded border bg-[#e8dcf5] border-[#c9a8e8] text-[#4a1a6b]">Fedex</span>
        <span className="px-2 py-0.5 rounded border bg-[#fbdad7] border-[#ecb0aa] text-[#7a1f16]">
          Viggiano / Essex / Pensk KP
        </span>
      </div>

      {/* months */}
      {months.map((m) => {
        const mondayIdx = m.firstDow === 0 ? 6 : m.firstDow - 1;
        const cells: (number | null)[] = [];
        for (let i = 0; i < mondayIdx; i++) cells.push(null);
        for (let d = 1; d <= m.daysInMonth; d++) {
          const key = dateKey(new Date(m.year, m.month, d));
          cells.push(key < windowStart || key > windowEnd ? null : d);
        }
        while (cells.length % 7 !== 0) cells.push(null);
        const weekRows: (number | null)[][] = [];
        for (let r = 0; r < cells.length / 7; r++) weekRows.push(cells.slice(r * 7, r * 7 + 7));

        return (
          <div key={m.year + "-" + m.month}>
            <div className="font-display text-base font-semibold mb-2">{m.name}</div>
            <table className="w-full table-fixed border-separate border-spacing-1.5">
              <thead>
                <tr>
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                    <th key={d} className="text-[11px] uppercase tracking-wide text-steel font-semibold p-1">
                      {d}
                    </th>
                  ))}
                  <th className="text-[11px] uppercase tracking-wide text-steel font-semibold p-1 text-right w-28">
                    Week total
                  </th>
                </tr>
              </thead>
              <tbody>
                {weekRows.map((week, wi) => {
                  const firstDay = week.find((d) => d !== null);
                  const wk =
                    firstDay != null ? weekStartKey(dateKey(new Date(m.year, m.month, firstDay as number))) : null;
                  const wt = wk ? weekTotals[wk] ?? 0 : 0;
                  const diff = wt - WEEKLY_GOAL;
                  return (
                    <tr key={wi}>
                      {week.map((dayNum, ci) => {
                        if (dayNum === null) return <td key={ci} />;
                        const key = dateKey(new Date(m.year, m.month, dayNum));
                        const dayRows = byDate[key] ?? [];
                        const dayTotal = dayRows.reduce((s, r) => s + r.amount, 0);
                        const weekend = ci >= 5;
                        return (
                          <td
                            key={ci}
                            onDragOver={(e) => {
                              e.preventDefault();
                              setDragOverKey(key);
                            }}
                            onDragLeave={() => setDragOverKey((k) => (k === key ? null : k))}
                            onDrop={(e) => handleDrop(e, key)}
                            className={clsx(
                              "align-top border border-line rounded-lg p-1.5 h-[90px]",
                              weekend ? "bg-[#f1ede4]" : "bg-white",
                              dragOverKey === key && "outline-dashed outline-2 outline-brand -outline-offset-2"
                            )}
                          >
                            <div className="text-[11px] text-steel mb-1">
                              {dayNum}
                              {dayTotal > 0 && (
                                <span className="float-right text-[10px] text-brand font-semibold">
                                  {fmtMoney(dayTotal)}
                                </span>
                              )}
                            </div>
                            {dayRows.map((r) => (
                              <div
                                key={r.id}
                                draggable
                                onDragStart={(e) => e.dataTransfer.setData("text/plain", r.id)}
                                onClick={() => setSelected(r)}
                                title={r.name + " - " + fmtMoney(r.amount)}
                                className={clsx(
                                  "block mb-0.5 px-1.5 py-0.5 rounded-md border text-[10px] whitespace-nowrap overflow-hidden text-ellipsis cursor-grab active:cursor-grabbing",
                                  missedIds.has(r.id)
                                    ? "bg-[#fde2e2] border-[#e05252] text-[#8f1d1d] font-semibold"
                                    : chipColors(r.name, r.amount)
                                )}
                              >
                                {r.job_id && <span className="inline-block w-1.5 h-1.5 rounded-full bg-go mr-1 align-middle" />}
                                {r.name} <span className="font-bold">{fmtMoney(r.amount)}</span>
                              </div>
                            ))}
                          </td>
                        );
                      })}
                      <td className="align-middle text-right pr-2 font-bold text-sm text-brand whitespace-nowrap">
                        {wk ? (
                          <>
                            {fmtMoney(wt)}
                            <span className={clsx("block text-[10px] font-medium", diff >= 0 ? "text-go" : "text-alert")}>
                              {(diff >= 0 ? "+" : "") + fmtMoney(Math.round(diff))} vs goal
                            </span>
                            {pendingCount(wk) > 0 && (
                              <button
                                type="button"
                                onClick={() => setDialogWeek(wk)}
                                className="mt-1 text-[10px] font-semibold text-brand border border-brand rounded px-1.5 py-0.5 hover:bg-paper"
                              >
                                Create work orders ({pendingCount(wk)})
                              </button>
                            )}
                          </>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}

      {/* summaries */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-line rounded-lg p-4 max-h-[420px] overflow-y-auto">
          <h2 className="font-semibold text-sm mb-2">Revenue by week (Mon to Sun)</h2>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-steel uppercase text-[11px]">
                <th className="py-1.5 pr-2">Week</th>
                <th className="py-1.5 pr-2 text-right">Total</th>
                <th className="py-1.5 text-right">vs goal</th>
              </tr>
            </thead>
            <tbody>
              {weekKeys.map((k) => {
                const end = shiftDate(k, 6);
                const full = k >= windowStart && end <= windowEnd;
                const wt = weekTotals[k];
                const diff = wt - WEEKLY_GOAL;
                return (
                  <tr key={k} className="border-t border-line">
                    <td className="py-1.5 pr-2">
                      {fmtShort(k)} to {fmtShort(end)}
                      {full ? "" : " (partial)"}
                    </td>
                    <td className="py-1.5 pr-2 text-right font-semibold text-brand">{fmtMoney(wt)}</td>
                    <td className={clsx("py-1.5 text-right font-semibold", diff >= 0 ? "text-go" : "text-alert")}>
                      {(diff >= 0 ? "+" : "") + fmtMoney(Math.round(diff))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="bg-white border border-line rounded-lg p-4 max-h-[420px] overflow-y-auto">
          <h2 className="font-semibold text-sm mb-2">Revenue by account</h2>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-steel uppercase text-[11px]">
                <th className="py-1.5 pr-2">Account</th>
                <th className="py-1.5 pr-2 text-right"># visits</th>
                <th className="py-1.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {accountSummary.map(([name, info]) => (
                <tr key={name} className="border-t border-line">
                  <td className="py-1.5 pr-2">{name}</td>
                  <td className="py-1.5 pr-2 text-right">{info.count}</td>
                  <td className="py-1.5 text-right font-semibold text-brand">{fmtMoney(info.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* remove dialog */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setSelected(null)}
        >
          <div className="bg-white rounded-lg p-5 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold">{selected.name}</p>
            <p className="text-sm text-steel mb-4">
              {fmtMoney(selected.amount)} on {fmtShort(selected.scheduled_date)}
            </p>
            {selected.job_id && (
              <p className="text-xs text-steel mb-3">
                This visit already has a work order. Removing it here does not delete the work order.
              </p>
            )}
            {missedIds.has(selected.id) && !selected.missed && (
              <p className="text-xs text-alert mb-3">{selected.series_id.startsWith("bk::") ? "Red because this Bentkey stop is past its day and not marked done." : "Red because its work order is not completed yet."}</p>
            )}
            <div className="mb-4">
              <label className="block text-xs font-medium text-steel uppercase tracking-wide mb-1">Change amount</label>
              <div className="flex items-center gap-2">
                <span className="text-steel">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amountDraft && amountDraft.id === selected.id ? amountDraft.value : String(selected.amount)}
                  onChange={(e) => setAmountDraft({ id: selected.id, value: e.target.value })}
                  className="w-28 border border-line rounded px-2 py-1.5 text-sm"
                />
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                <button
                  disabled={busy}
                  onClick={() => saveAmount([selected.id])}
                  className="border border-brand text-brand font-semibold py-1.5 px-3 rounded text-sm hover:bg-brand/5 transition disabled:opacity-50"
                >
                  Save for this visit
                </button>
                {selectedLater.length > 1 && (
                  <button
                    disabled={busy}
                    onClick={() => saveAmount(selectedLater.map((r) => r.id))}
                    className="border border-brand text-brand font-semibold py-1.5 px-3 rounded text-sm hover:bg-brand/5 transition disabled:opacity-50"
                  >
                    Save for this and all later ({selectedLater.length})
                  </button>
                )}
              </div>
              {error && <p className="text-xs text-alert mt-2">{error}</p>}
            </div>
            <div className="flex flex-col gap-2">
              {todayKey !== "" && selected.scheduled_date < todayKey && !selected.missed && (
                <button
                  disabled={busy}
                  onClick={() => setMissedFlag(selected.id, true)}
                  className="border border-alert bg-alert/5 text-alert font-semibold py-2 rounded text-sm hover:bg-alert/10 transition disabled:opacity-50"
                >
                  Mark as missed (didn&apos;t happen)
                </button>
              )}
              {selected.series_id.startsWith("bk::") && !selected.done && todayKey !== "" && selected.scheduled_date < todayKey && (
                <button
                  disabled={busy}
                  onClick={() => setDoneFlag(selected.id)}
                  className="border border-go text-go font-semibold py-2 rounded text-sm hover:bg-go/5 transition disabled:opacity-50"
                >
                  Mark as done (serviced)
                </button>
              )}
              {selected.missed && !selected.series_id.startsWith("bk::") && (
                <button
                  disabled={busy}
                  onClick={() => setMissedFlag(selected.id, false)}
                  className="border border-go text-go font-semibold py-2 rounded text-sm hover:bg-go/5 transition disabled:opacity-50"
                >
                  Mark as done (it did happen)
                </button>
              )}
              <button
                disabled={busy}
                onClick={() => removeRows([selected.id])}
                className="border border-alert text-alert font-semibold py-2 rounded text-sm hover:bg-alert/5 transition disabled:opacity-50"
              >
                Remove just this one
              </button>
              {selectedLater.length > 1 && (
                <button
                  disabled={busy}
                  onClick={() => removeRows(selectedLater.map((r) => r.id))}
                  className="border border-alert text-alert font-semibold py-2 rounded text-sm hover:bg-alert/5 transition disabled:opacity-50"
                >
                  Remove this and all later ones ({selectedLater.length})
                </button>
              )}
              {selectedSeries.length > selectedLater.length && (
                <button
                  disabled={busy}
                  onClick={() => removeRows(selectedSeries.map((r) => r.id))}
                  className="border border-alert text-alert font-semibold py-2 rounded text-sm hover:bg-alert/5 transition disabled:opacity-50"
                >
                  Remove the whole series ({selectedSeries.length})
                </button>
              )}
              <button
                onClick={() => setSelected(null)}
                className="border border-line text-steel font-semibold py-2 rounded text-sm hover:bg-paper transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {dialogWeek && (
        <WeekWorkOrdersDialog
          weekStart={dialogWeek}
          visits={rows.filter((r) => weekStartKey(r.scheduled_date) === dialogWeek)}
          customers={customers}
          links={links}
          onClose={() => setDialogWeek(null)}
          onCreated={(created, newLinks) => {
            const jobByVisit = new Map(created.map((c) => [c.revenue_id, c.job_id]));
            setRows((prev) =>
              prev.map((r) => (jobByVisit.has(r.id) ? { ...r, job_id: jobByVisit.get(r.id) as string } : r))
            );
            setLinks((prev) => ({ ...prev, ...newLinks }));
            setDialogWeek(null);
            setNotice("Created " + created.length + " work order" + (created.length === 1 ? "" : "s") + ". They are on the admin calendar, ready to assign.");
          }}
        />
      )}
    </div>
  );
}
