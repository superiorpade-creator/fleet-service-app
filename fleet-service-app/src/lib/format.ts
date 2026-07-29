/**
 * Turns the DB's raw auto-incrementing job_number into the display format
 * used everywhere in the UI and on the completion PDF, e.g. 42 -> "WO-00042".
 */
export function formatWorkOrderNumber(jobNumber: number): string {
  return `WO-${String(jobNumber).padStart(5, "0")}`;
}

// Trailing words that commonly show up in fleet-list filenames but aren't
// part of the customer's actual name — stripped off the end only.
const NOISE_SUFFIXES = [
  "unit list",
  "units list",
  "unit roster",
  "fleet list",
  "fleet roster",
  "wash list",
  "units",
  "unit",
  "roster",
  "list",
  "fleet",
];

/**
 * Guesses a customer name from an uploaded spreadsheet's filename, for the
 * bulk import screen. Strips the extension, swaps separators for spaces,
 * drops common noise words ("unit list", "roster", ...), trims any leading
 * date stamp, and title-cases the result if it looks like it needs it.
 * This is a starting point the admin reviews and can always overwrite.
 */
export function guessClientNameFromFilename(filename: string): string {
  let name = filename.replace(/\.[^.]+$/, ""); // drop extension
  name = name.replace(/[_\-]+/g, " "); // underscores/hyphens -> spaces
  name = name.replace(/\s+/g, " ").trim();

  // Drop a leading date stamp like "2026-07-28 " or "07.28.26 "
  name = name.replace(/^\d{1,4}[.\-/]\d{1,2}[.\-/]\d{1,4}\s+/, "");

  const lower = name.toLowerCase();
  for (const suffix of NOISE_SUFFIXES) {
    if (lower.endsWith(suffix) && lower.length > suffix.length) {
      name = name.slice(0, name.length - suffix.length).trim();
      break;
    }
  }

  // Title-case only if the source looks like it had no real casing info
  // (all lowercase or all uppercase) — otherwise assume "AcmeCo" etc. is intentional.
  if (name === name.toLowerCase() || name === name.toUpperCase()) {
    name = name
      .split(" ")
      .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
      .join(" ");
  }

  return name || filename;
}
