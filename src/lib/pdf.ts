import React from "react";
import { Document, Page, Text, View, StyleSheet, renderToBuffer, Image, Svg, Polyline } from "@react-pdf/renderer";
import type { Job, Unit, Profile } from "./types";
import { formatWorkOrderNumber } from "./format";

const GRID_COLUMNS = 7;
const CELL_WIDTH = `${100 / GRID_COLUMNS}%`;

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica", color: "#14181F" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    borderBottom: "2 solid #14181F",
    paddingBottom: 12,
  },
  logo: { width: 120, height: 40, objectFit: "contain" },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  metaGrid: { flexDirection: "row", marginBottom: 20, gap: 24 },
  metaBlock: { flexDirection: "column" },
  metaLabel: { fontSize: 8, color: "#3E4C59", textTransform: "uppercase", marginBottom: 2 },
  metaValue: { fontSize: 11, fontFamily: "Helvetica-Bold" },

  // Compact checkbox grid - this is the main body of the PDF. Units are
  // grouped by type (Tractor, Trailer, ...) when the sheet had that info,
  // each group laid out as a dense multi-column grid rather than one row
  // per unit, so even a 150+ unit work order fits on a single page.
  groupLabel: { fontSize: 9, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  groupRule: { borderBottom: "0.5 solid #E3E1DB", marginBottom: 8 },
  columnGrid: { flexDirection: "row", marginBottom: 16 },
  gridColumn: { width: CELL_WIDTH, flexDirection: "column", paddingRight: 4 },
  cell: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  checkbox: {
    width: 7,
    height: 7,
    border: "0.75 solid #B4B2A9",
    marginRight: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  unitNumber: { fontSize: 8 },
  unitNumberMuted: { fontSize: 8, color: "#3E4C59" },

  summary: { fontSize: 10, marginTop: 4, marginBottom: 12 },

  notesHeading: { fontSize: 9, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  noteLine: { fontSize: 8, color: "#3E4C59", marginBottom: 2 },

  footer: { marginTop: 16, paddingTop: 12, borderTop: "1 solid #E3E1DB", fontSize: 9, color: "#3E4C59" },
  pageNumber: { position: "absolute", bottom: 16, right: 32, fontSize: 8, color: "#3E4C59" },
});

interface CompletionPdfProps {
  job: Job;
  units: Unit[];
  crew: Profile[];
  companyName: string;
  companyLogoUrl?: string;
}

/** One checkbox + unit number cell in the grid. The box is always outlined;
 * a checkmark is drawn inside it when serviced, a dash when the truck
 * wasn't on-site that day, or nothing at all if neither has happened yet. */
function UnitCell(unit: Unit) {
  return React.createElement(
    View,
    { style: styles.cell, key: unit.id, wrap: false },
    React.createElement(
      View,
      { style: styles.checkbox },
      unit.serviced
        ? React.createElement(
            Svg,
            { width: 6, height: 6, viewBox: "0 0 10 10" },
            React.createElement(Polyline, { points: "1,5 4,8 9,1", stroke: "#14181F", strokeWidth: 1.8, fill: "none" })
          )
        : unit.not_on_site
        ? React.createElement(
            Svg,
            { width: 6, height: 6, viewBox: "0 0 10 10" },
            React.createElement(Polyline, { points: "1,5 9,5", stroke: "#3E4C59", strokeWidth: 1.8, fill: "none" })
          )
        : null
    ),
    React.createElement(
      Text,
      { style: unit.not_on_site ? styles.unitNumberMuted : styles.unitNumber },
      unit.not_on_site ? `${unit.unit_number} (N/A)` : unit.unit_number
    )
  );
}

/** A labeled group (e.g. "TRACTOR (85)") followed by its grid of unit cells,
 * filled column-major - top to bottom down the first column, then the
 * next column over - which reads more like a paper checklist than filling
 * left-to-right across the page. */
function UnitGroup(label: string | null, groupUnits: Unit[], key: string) {
  const rows = Math.ceil(groupUnits.length / GRID_COLUMNS) || 1;
  const columns: Unit[][] = [];
  for (let i = 0; i < GRID_COLUMNS; i++) {
    columns.push(groupUnits.slice(i * rows, (i + 1) * rows));
  }

  return React.createElement(
    View,
    { key, wrap: true },
    label
      ? React.createElement(
          View,
          {},
          React.createElement(Text, { style: styles.groupLabel }, `${label} (${groupUnits.length})`),
          React.createElement(View, { style: styles.groupRule })
        )
      : null,
    React.createElement(
      View,
      { style: styles.columnGrid },
      ...columns.map((colUnits, i) =>
        React.createElement(View, { key: `col-${i}`, style: styles.gridColumn }, ...colUnits.map(UnitCell))
      )
    )
  );
}

function CompletionDocument({ job, units, crew, companyName, companyLogoUrl }: CompletionPdfProps) {
  const servicedCount = units.filter((u) => u.serviced).length;
  const notOnSiteCount = units.filter((u) => u.not_on_site).length;

  // Group by unit_type, preserving first-seen order. If every unit shares
  // the same (or no) type, skip the group label entirely - no point
  // printing "UNITS (15)" as a header when there's nothing to distinguish.
  const groups: { label: string | null; units: Unit[] }[] = [];
  const groupIndex = new Map<string, number>();
  for (const unit of units) {
    const key = unit.unit_type?.trim() || "";
    if (!groupIndex.has(key)) {
      groupIndex.set(key, groups.length);
      groups.push({ label: key || null, units: [] });
    }
    groups[groupIndex.get(key)!].units.push(unit);
  }
  const showGroupLabels = groups.length > 1 || (groups.length === 1 && groups[0].label !== null);

  // Auto-tally serviced units by type (e.g. "5-Tractors, 8-Trailers") so
  // nobody has to count checkboxes by hand. Only named types are included -
  // an unlabeled/mixed group wouldn't mean anything as a tally.
  const typeBreakdown = groups
    .filter((g) => g.label)
    .map((g) => `${g.units.filter((u) => u.serviced).length}-${g.label}s`)
    .join(", ");

  const unitsWithNotes = units.filter((u) => u.notes?.trim());

  return React.createElement(
    Document,
    {},
    React.createElement(
      Page,
      { size: "LETTER", style: styles.page },
      // Header
      React.createElement(
        View,
        { style: styles.header },
        React.createElement(Text, { style: styles.title }, companyName),
        companyLogoUrl ? React.createElement(Image, { src: companyLogoUrl, style: styles.logo }) : null
      ),
      // Job meta
      React.createElement(
        View,
        { style: styles.metaGrid },
        React.createElement(
          View,
          { style: styles.metaBlock },
          React.createElement(Text, { style: styles.metaLabel }, "Work Order #"),
          React.createElement(Text, { style: styles.metaValue }, job.job_number ? formatWorkOrderNumber(job.job_number) : "WO-PENDING")
        ),
        React.createElement(
          View,
          { style: styles.metaBlock },
          React.createElement(Text, { style: styles.metaLabel }, "Client"),
          React.createElement(Text, { style: styles.metaValue }, job.client_name)
        ),
        React.createElement(
          View,
          { style: styles.metaBlock },
          React.createElement(Text, { style: styles.metaLabel }, "Service Date"),
          React.createElement(Text, { style: styles.metaValue }, job.scheduled_date ?? "-")
        ),
        React.createElement(
          View,
          { style: styles.metaBlock },
          React.createElement(Text, { style: styles.metaLabel }, "Completed"),
          React.createElement(
            Text,
            { style: styles.metaValue },
            job.completed_at ? new Date(job.completed_at).toLocaleDateString() : "-"
          )
        )
      ),
      // Compact checkbox grid, grouped by type when meaningful
      ...groups.map((g, i) => UnitGroup(showGroupLabels ? g.label ?? "Units" : null, g.units, `group-${i}`)),
      // Summary - includes the auto-tallied type breakdown when there's
      // more than one named type to distinguish, plus a not-on-site count
      // when any trucks were skipped that day.
      React.createElement(
        Text,
        { style: styles.summary },
        (typeBreakdown
          ? `${servicedCount} of ${units.length} units serviced (${typeBreakdown})`
          : `${servicedCount} of ${units.length} units serviced`) +
          (notOnSiteCount > 0 ? ` - ${notOnSiteCount} not on-site` : "")
      ),
      // Notes - only units that actually have one, so the common case (no
      // notes) doesn't add anything to the page.
      unitsWithNotes.length > 0
        ? React.createElement(
            View,
            {},
            React.createElement(Text, { style: styles.notesHeading }, "Notes"),
            ...unitsWithNotes.map((u) =>
              React.createElement(Text, { style: styles.noteLine, key: u.id }, `${u.unit_number} - ${u.notes}`)
            )
          )
        : null,
      // Footer
      React.createElement(
        View,
        { style: styles.footer },
        React.createElement(Text, {}, `Work order generated ${new Date().toLocaleDateString()} - ${companyName}`)
      ),
      // Page number - only shows if this ever does spill past one page
      // (e.g. an exceptionally large work order).
      React.createElement(Text, {
        style: styles.pageNumber,
        fixed: true,
        render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
          totalPages > 1 ? `Page ${pageNumber} of ${totalPages}` : "",
      })
    )
  );
}

/**
 * Renders the completion PDF for a closed-out job to a Buffer, ready to
 * upload to Supabase Storage or stream back as a download.
 */
export async function renderCompletionPdf(props: CompletionPdfProps): Promise<Buffer> {
  return renderToBuffer(CompletionDocument(props) as any);
}
