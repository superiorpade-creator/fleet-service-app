import * as XLSX from "xlsx";
import type { ImportedUnitRow } from "./types";

// Header aliases we'll recognize so admins don't have to reformat their
// existing spreadsheets to match one exact column naming scheme.
const UNIT_NUMBER_KEYS = ["unit", "unit number", "unit #", "unit no", "truck", "truck #", "vehicle", "vehicle #"];
const LOCATION_KEYS = ["location", "yard", "lot", "site"];
const TYPE_KEYS = ["type", "unit type", "vehicle type"];

function normalizeHeader(h: string) {
  return h.trim().toLowerCase();
}

function findKey(row: Record<string, unknown>, candidates: string[]): string | undefined {
  const keys = Object.keys(row);
  return keys.find((k) => candidates.includes(normalizeHeader(k)));
}

/**
 * Parses an uploaded Excel/CSV file (as an ArrayBuffer) into a clean list of
 * unit rows. Reads the first sheet, tries to auto-detect the unit number
 * column, and skips blank rows. Returns rows in the order they appear so
 * sort order on the checklist matches the source sheet.
 */
export function parseUnitsFromWorkbook(buffer: ArrayBuffer): ImportedUnitRow[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  if (rows.length === 0) return [];

  const unitKey = findKey(rows[0], UNIT_NUMBER_KEYS);
  const locationKey = findKey(rows[0], LOCATION_KEYS);
  const typeKey = findKey(rows[0], TYPE_KEYS);

  if (!unitKey) {
    throw new Error(
      "Couldn't find a unit number column. Expected a header like 'Unit #', 'Unit Number', or 'Truck #'."
    );
  }

  return rows
    .map((row) => ({
      unit_number: String(row[unitKey] ?? "").trim(),
      location: locationKey ? String(row[locationKey] ?? "").trim() || undefined : undefined,
      unit_type: typeKey ? String(row[typeKey] ?? "").trim() || undefined : undefined,
    }))
    .filter((row) => row.unit_number.length > 0);
}
