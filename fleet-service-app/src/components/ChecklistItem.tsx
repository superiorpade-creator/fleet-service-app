"use client";

import clsx from "clsx";
import type { Unit } from "@/lib/types";

export function ChecklistItem({
  unit,
  disabled,
  onToggle,
  onNotesChange,
}: {
  unit: Unit;
  disabled: boolean;
  onToggle: (unit: Unit) => void;
  onNotesChange: (unit: Unit, notes: string) => void;
}) {
  return (
    <div
      className={clsx(
        "flex items-start gap-3 border border-line rounded-lg p-3 bg-white transition",
        unit.serviced && "border-go/40 bg-go/5"
      )}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => onToggle(unit)}
        aria-pressed={unit.serviced}
        aria-label={`Mark unit ${unit.unit_number} as ${unit.serviced ? "not serviced" : "serviced"}`}
        className={clsx(
          "shrink-0 w-9 h-9 rounded-md border-2 flex items-center justify-center font-bold text-lg transition",
          unit.serviced
            ? "bg-go border-go text-white"
            : "border-line text-transparent hover:border-steel",
          disabled && "opacity-50"
        )}
      >
        ✓
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-mono font-semibold text-base">{unit.unit_number}</span>
          {unit.unit_type && <span className="text-xs text-steel">{unit.unit_type}</span>}
          {unit.location && <span className="text-xs text-steel">· {unit.location}</span>}
        </div>
        {!disabled && (
          <input
            type="text"
            placeholder="Add a note (optional)"
            defaultValue={unit.notes ?? ""}
            onBlur={(e) => onNotesChange(unit, e.target.value)}
            className="mt-1.5 w-full text-sm border-b border-line focus:outline-none focus:border-safety bg-transparent py-1"
          />
        )}
        {disabled && unit.notes && <p className="mt-1 text-sm text-steel">{unit.notes}</p>}
      </div>
    </div>
  );
}
