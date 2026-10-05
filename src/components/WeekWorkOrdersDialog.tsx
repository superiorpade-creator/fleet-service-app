"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import type { RevenueRow } from "./RevenuePlanner";
import { guessCustomerId } from "@/lib/revenue-orders";

export interface CustomerOption {
  id: string;
  name: string;
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function fmtDay(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function money(n: number): string {
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function WeekWorkOrdersDialog({
  weekStart,
  visits,
  customers,
  links,
  onClose,
  onCreated,
}: {
  weekStart: string;
  visits: RevenueRow[];
  customers: CustomerOption[];
  links: Record<string, string | null>;
  onClose: () => void;
  onCreated: (created: { revenue_id: string; job_id: string }[], newLinks: Record<string, string | null>) => void;
}) {
  const pending = useMemo(
    () =>
      visits
        .filter((v) => !v.job_id)
        .sort((a, b) => (a.scheduled_date + "|" + a.name).localeCompare(b.scheduled_date + "|" + b.name)),
    [visits]
  );
  const doneCount = visits.length - pending.length;

  // Account -> customer picks: a saved match wins, then a name-based guess,
  // otherwise it's left for the admin to choose.
  const initial = useMemo(() => {
    const choices: Record<string, string> = {};
    const guessed = new Set<string>();
    for (const v of pending) {
      if (Object.prototype.hasOwnProperty.call(choices, v.name)) continue;
      if (Object.prototype.hasOwnProperty.call(links, v.name)) {
        const saved = links[v.name];
        choices[v.name] = saved === null ? "none" : saved;
        continue;
      }
      const guess = guessCustomerId(v.name, customers);
      if (guess) {
        choices[v.name] = guess;
        guessed.add(v.name);
      } else {
        choices[v.name] = "";
      }
    }
    return { choices, guessed };
  }, [pending, links, customers]);

  const [ticked, setTicked] = useState<Set<string>>(() => new Set(pending.map((v) => v.id)));
  const [choices, setChoices] = useState<Record<string, string>>(() => initial.choices);
  const [guessed, setGuessed] = useState<Set<string>>(() => initial.guessed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = pending.filter((v) => ticked.has(v.id));
  const missingNames = Array.from(new Set(chosen.filter((v) => choices[v.name] === "").map((v) => v.name)));

  const endDate = parseDate(weekStart);
  endDate.setDate(endDate.getDate() + 6);

  function toggle(id: string) {
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setChoice(name: string, value: string) {
    setChoices((prev) => ({ ...prev, [name]: value }));
    setGuessed((prev) => {
      const next = new Set(prev);
      next.delete(name);
      return next;
    });
  }

  async function handleCreate() {
    if (chosen.length === 0 || missingNames.length > 0) return;
    setBusy(true);
    setError(null);
    const toId = (name: string): string | null => (choices[name] === "none" ? null : choices[name]);
    const body = {
      visits: chosen.map((v) => ({ revenue_id: v.id, customer_id: toId(v.name) })),
      links: Array.from(new Set(chosen.map((v) => v.name))).map((name) => ({
        account_name: name,
        customer_id: toId(name),
      })),
    };
    const res = await fetch("/api/revenue/work-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Couldn't create the work orders.");
      return;
    }
    const newLinks: Record<string, string | null> = {};
    for (const l of body.links) newLinks[l.account_name] = l.customer_id;
    onCreated(data.created as { revenue_id: string; job_id: string }[], newLinks);
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-lg w-full max-w-3xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-line">
          <p className="font-semibold">
            Create work orders: {fmtDay(parseDate(weekStart))} to {fmtDay(endDate)}
          </p>
          <p className="text-xs text-steel mt-1">
            Each ticked visit becomes a scheduled work order with no crew assigned, using the customer&apos;s saved
            units. Untick any you want to skip. Matches marked &quot;guessed&quot; are my best match by name, so
            check them.
          </p>
          {doneCount > 0 && (
            <p className="text-xs text-steel mt-1">{doneCount} visit(s) this week already have a work order.</p>
          )}
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {pending.length === 0 ? (
            <p className="text-sm text-steel">Everything this week already has a work order.</p>
          ) : (
            <>
              <div className="flex gap-3 text-xs mb-2">
                <button type="button" className="text-brand font-semibold" onClick={() => setTicked(new Set(pending.map((v) => v.id)))}>
                  Select all
                </button>
                <button type="button" className="text-brand font-semibold" onClick={() => setTicked(new Set())}>
                  Select none
                </button>
              </div>
              {pending.map((v, i) => {
                const showHeader = i === 0 || pending[i - 1].scheduled_date !== v.scheduled_date;
                const missing = choices[v.name] === "";
                return (
                  <div key={v.id}>
                    {showHeader && (
                      <div className="text-xs font-semibold text-steel uppercase tracking-wide mt-3 mb-1">
                        {fmtDay(parseDate(v.scheduled_date))}
                      </div>
                    )}
                    <div
                      className={clsx(
                        "flex items-center gap-2 py-1 px-2 rounded",
                        ticked.has(v.id) && missing && "bg-[#fff3c4]"
                      )}
                    >
                      <input type="checkbox" checked={ticked.has(v.id)} onChange={() => toggle(v.id)} />
                      <div className="flex-1 min-w-0 text-sm truncate">
                        {v.name} <span className="text-steel">{money(v.amount)}</span>
                      </div>
                      <select
                        value={choices[v.name]}
                        onChange={(e) => setChoice(v.name, e.target.value)}
                        className="w-56 border border-line rounded px-2 py-1 text-sm bg-white"
                      >
                        <option value="">Pick a customer...</option>
                        <option value="none">No customer record</option>
                        {customers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      {guessed.has(v.name) && <span className="text-[10px] text-steel">guessed</span>}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div className="p-4 border-t border-line flex flex-wrap items-center gap-3">
          {error && <p className="text-alert text-sm w-full">{error}</p>}
          {missingNames.length > 0 && (
            <p className="text-xs text-steel flex-1">
              Pick a customer (or &quot;No customer record&quot;) for the highlighted rows to continue.
            </p>
          )}
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="border border-line text-steel font-semibold px-4 py-2 rounded text-sm hover:bg-paper transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={busy || chosen.length === 0 || missingNames.length > 0}
              className="bg-brand text-white font-semibold px-4 py-2 rounded text-sm disabled:opacity-50 hover:opacity-90 transition"
            >
              {busy ? "Creating..." : "Create " + chosen.length + " work order" + (chosen.length === 1 ? "" : "s")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
