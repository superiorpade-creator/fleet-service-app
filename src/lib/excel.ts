import * as XLSX from "xlsx";
import type { ImportedUnitRow } from "./types";

// Generic ID-style headers — recognized as a unit-number column, but the
// header text itself isn't meaningful "type" info on its own (a lone
// "Unit #" column doesn't need every row tagged "Unit #").
const GENERIC_ID_KEYS = ["unit", "unit number", "unit #", "unit no", "truck #", "vehicle", "vehicle #"];

// Category-style headers — real-world fleet templates often lay out several
// parallel columns, one per vehicle type (Tractor, Trailer, Truck, Van...),
// each listing that type's unit numbers straight down the column. When we
// see one of these, the header text itself becomes each unit's type.
const CATEGORY_KEYS = [
  "tractor",
  "trailer",
  "truck",
  "van",
  "reefer",
  "flatbed",
  "box truck",
  "boxtruck",
  "chassis",
  "container",
  "dry van",
  "step van",
  "pickup",
  "bus",
  "dump truck",
  "dumptruck",
  "tanker",
  "yard trailer",
  "straight truck",
  "cargo van",
];

const LOCATION_KEYS = ["location", "yard", "lot", "site"];
const TYPE_KEYS = ["type", "unit type", "vehicle type"];

// Labels that precede the customer's name on a work-order-style template
// (letterhead + customer info block above the actual unit list).
const CUSTOMER_LABEL_ALIASES = ["customer address", "customer name", "customer", "client", "account", "bill to"];

function normalizeHeader(h: unknown): string {
  return String(h ?? "").trim().toLowerCase();
}

interface UnitColumn {
  colIndex: number;
  type?: string; // set when the header matched a CATEGORY_KEYS word
}

interface HeaderMatch {
  rowIndex: number;
  unitColumns: UnitColumn[];
  locationCol: number;
  typeCol: number;
}

/**
 * Scans every row of the sheet — not just row 1 — looking for the row that
 * contains unit-number column headers. Collects EVERY qualifying column,
 * not just the first, so a template with parallel "Tractor" / "Trailer" /
 * "Truck" columns (rather than one single ID column) still captures every
 * unit instead of silently dropping all but the first column.
 *
 * CATEGORY_KEYS is checked before GENERIC_ID_KEYS so that a bare category
 * word (e.g. a column simply headed "Truck") is captured as a type label,
 * not silently swallowed as an anonymous ID column. Some fleets repeat the
 * same category header ("Truck") across several parallel columns — each
 * one still needs to carry its type through to every unit below it.
 */
function findHeaderRow(rows: unknown[][]): HeaderMatch | null {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const unitColumns: UnitColumn[] = [];
    let locationCol = -1;
    let typeCol = -1;

    for (let c = 0; c < row.length; c++) {
      const raw = row[c];
      const cell = normalizeHeader(raw);

      if (CATEGORY_KEYS.includes(cell)) {
        unitColumns.push({ colIndex: c, type: String(raw).trim() });
      } else if (GENERIC_ID_KEYS.includes(cell)) {
        unitColumns.push({ colIndex: c });
      }

      if (locationCol === -1 && LOCATION_KEYS.includes(cell)) locationCol = c;
      if (typeCol === -1 && TYPE_KEYS.includes(cell)) typeCol = c;
    }

    if (unitColumns.length > 0) {
      return { rowIndex: r, unitColumns, locationCol, typeCol };
    }
  }
  return null;
}

/**
 * Looks for a "Customer Address" / "Customer" / "Client" style label
 * anywhere in the sheet, then reads the first non-empty cell in that same
 * column over the next few rows below it — matching templates where the
 * label sits on its own row and the customer's name is the next line down.
 */
function extractSuggestedClientName(rows: unknown[][]): string | undefined {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      const cell = normalizeHeader(row[c]);
      if (!CUSTOMER_LABEL_ALIASES.includes(cell)) continue;

      for (let below = r + 1; below < Math.min(r + 4, rows.length); below++) {
        const value = String((rows[below] ?? [])[c] ?? "").trim();
        if (value) return value;
      }
    }
  }
  return undefined;
}

export interface ParsedWorkbook {
  units: ImportedUnitRow[];
  suggestedClientName?: string;
}

/**
 * Parses an uploaded Excel/CSV file (as an ArrayBuffer) into a clean list of
 * unit rows, plus a best-guess customer name pulled from the sheet itself.
 * Handles two real-world shapes:
 *  - "Narrow": one ID column (Unit #, Truck #, Vehicle #...), optionally
 *    with separate Location/Type columns alongside it.
 *  - "Wide": several parallel columns, one per vehicle category (Tractor,
 *    Trailer, Truck, Van...), each listing that category's unit numbers
 *    straight down — every column is read, and the header becomes each
 *    unit's type. Fleets sometimes repeat the same category header (e.g.
 *    "Truck") across multiple side-by-side columns; each still gets typed.
 * Either way, it searches the whole sheet for the header row rather than
 * assuming row 1, since real templates often have a letterhead/customer
 * info block above the actual unit list.
 */
export function parseWorkbook(buffer: ArrayBuffer): ParsedWorkbook {
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", blankrows: false });

  const header = findHeaderRow(rows);
  if (!header) {
    throw new Error(
      "Couldn't find a unit number column anywhere in the sheet. Expected a header like 'Unit #', 'Truck', 'Tractor', or 'Trailer' somewhere in the file."
    );
  }

  const dataRows = rows.slice(header.rowIndex + 1);
  const units: ImportedUnitRow[] = [];

  // Process one unit-source column fully (top to bottom) before moving to
  // the next, so all "Tractor" units stay together, followed by all
  // "Trailer" units, etc. — matches how these sheets read visually.
  for (const col of header.unitColumns) {
    for (const row of dataRows) {
      const unit_number = String(row[col.colIndex] ?? "").trim();
      if (!unit_number) continue;

      units.push({
        unit_number,
        location:
          header.locationCol !== -1 ? String(row[header.locationCol] ?? "").trim() || undefined : undefined,
        unit_type:
          col.type ?? (header.typeCol !== -1 ? String(row[header.typeCol] ?? "").trim() || undefined : undefined),
      });
    }
  }

  const suggestedClientName = extractSuggestedClientName(rows.slice(0, header.rowIndex));

  return { units, suggestedClientName };
}
