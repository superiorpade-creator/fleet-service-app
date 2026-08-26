import React from "react";
import { Document, Page, Text, View, StyleSheet, renderToBuffer, Image, Svg, Polyline } from "@react-pdf/renderer";
import type { Job, Unit, Profile, Customer } from "./types";
import { formatWorkOrderNumber } from "./format";

// Roughly how much vertical space (in points) is left on a Letter page for
// the type-group tables after the header, meta row, and summary/footer
// take their share. Used to figure out how many rows each group's table
// can afford before it needs to wrap into another side-by-side column.
const TABLE_BUDGET_HEIGHT = 560;
const ROW_HEIGHT = 22; // approx height of one table row at this font size
const GROUP_OVERHEAD = 43; // approx height of a group's label + header row
const MIN_ROWS_PER_COLUMN = 8; // never so short a column looks silly
const MAX_ROWS_PER_COLUMN = 30; // never so tall a single group overflows alone

/**
 * How many rows each type-group's table gets before wrapping into an
 * additional side-by-side column - split evenly across however many
 * groups are actually on this work order, so a job with one big group
 * (e.g. 82 vans) and a job with several (50 tractors + 60 trailers) both
 * come out fitting on one page instead of using one fixed row count that
 * only works for the first case.
 */
function rowsPerColumnFor(numGroups: number): number {
  const perGroupBudget = TABLE_BUDGET_HEIGHT / Math.max(1, numGroups);
  const rows = Math.floor((perGroupBudget - GROUP_OVERHEAD) / ROW_HEIGHT);
  return Math.max(MIN_ROWS_PER_COLUMN, Math.min(MAX_ROWS_PER_COLUMN, rows));
}

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 9, fontFamily: "Helvetica", color: "#14181F" },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  companyName: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  companyLine: { fontSize: 9, color: "#3E4C59", marginTop: 2 },
  logo: { width: 100, height: 34, objectFit: "contain" },
  dateBlock: { alignItems: "flex-end" },
  dateLabel: { fontSize: 8, color: "#3E4C59", textTransform: "uppercase" },
  dateValue: { fontSize: 10, borderBottom: "1 solid #14181F", paddingBottom: 2, minWidth: 90, textAlign: "right" },

  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 14, gap: 16 },
  metaLeft: { flexDirection: "column", flexGrow: 1 },
  metaLabel: { fontSize: 8, color: "#3E4C59", textTransform: "uppercase", marginBottom: 2 },
  metaValue: { fontSize: 10, fontFamily: "Helvetica-Bold", borderBottom: "1 solid #14181F", paddingBottom: 2, marginBottom: 8 },
  customerBox: { border: "1 solid #14181F", padding: "6 8", minWidth: 200 },
  customerName: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  customerLine: { fontSize: 9 },

  groupLabel: { fontSize: 9, fontFamily: "Helvetica-Bold", marginBottom: 4, marginTop: 10 },
  table: { flexDirection: "column", border: "1 solid #14181F", marginBottom: 6 },
  tableRow: { flexDirection: "row" },
  th: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    padding: "3 4",
    border: "0.5 solid #14181F",
    textAlign: "center",
    flexGrow: 1,
    flexBasis: 0,
  },
  thIndex: { fontSize: 8, fontFamily: "Helvetica-Bold", padding: "3 4", border: "0.5 solid #14181F", width: 18, flexShrink: 0 },
  tdIndex: {
    fontSize: 8,
    color: "#3E4C59",
    padding: "3 4",
    border: "0.5 solid #E3E1DB",
    width: 18,
    flexShrink: 0,
    textAlign: "center",
  },
  td: {
    flexGrow: 1,
    flexBasis: 0,
    flexDirection: "row",
    alignItems: "center",
    padding: "3 4",
    border: "0.5 solid #E3E1DB",
  },
  unitNumber: { fontSize: 12 },
  unitNumberMuted: { fontSize: 12, color: "#3E4C59" },
  checkbox: { width: 7, height: 7, marginLeft: 4 },

  summary: { fontSize: 10, marginTop: 8, marginBottom: 10, fontFamily: "Helvetica-Bold" },

  notesHeading: { fontSize: 9, fontFamily: "Helvetica-Bold", marginBottom: 4, marginTop: 4 },
  noteLine: { fontSize: 8, color: "#3E4C59", marginBottom: 2 },

  pageNumber: { position: "absolute", bottom: 16, right: 28, fontSize: 8, color: "#3E4C59" },
});

interface CompletionPdfProps {
  job: Job;
  units: Unit[];
  crew: Profile[];
  customer?: Customer | null;
  companyName: string;
  companyLogoUrl?: string;
  companyPhone?: string;
  companyEmail?: string;
}

function UnitCell(unit: Unit) {
  return React.createElement(
    View,
    { style: styles.td, key: unit.id },
    React.createElement(
      Text,
      { style: unit.not_on_site ? styles.unitNumberMuted : styles.unitNumber },
      unit.not_on_site ? `${unit.unit_number} (N/A)` : unit.unit_number
    ),
    unit.serviced
      ? React.createElement(
          Svg,
          { style: styles.checkbox, viewBox: "0 0 10 10" },
          React.createElement(Polyline, { points: "1,5 4,8 9,1", stroke: "#0F6E56", strokeWidth: 1.8, fill: "none" })
        )
      : null
  );
}

function UnitGroup(label: string | null, groupUnits: Unit[], key: string, rowsPerColumn: number) {
  const rows = Math.min(rowsPerColumn, groupUnits.length) || 1;
  const numSubColumns = Math.max(1, Math.ceil(groupUnits.length / rowsPerColumn));
  const subColumns: Unit[][] = [];
  for (let i = 0; i < numSubColumns; i++) {
    subColumns.push(groupUnits.slice(i * rows, (i + 1) * rows));
  }

  const headerRow = React.createElement(
    View,
    { style: styles.tableRow, key: "head" },
    React.createElement(Text, { style: styles.thIndex }, ""),
    ...subColumns.map((_, i) => React.createElement(Text, { style: styles.th, key: `th-${i}` }, label ?? "Unit"))
  );

  const bodyRows = [];
  for (let r = 0; r < rows; r++) {
    bodyRows.push(
      React.createElement(
        View,
        { style: styles.tableRow, key: `row-${r}`, wrap: false },
        React.createElement(Text, { style: styles.tdIndex }, String(r + 1)),
        ...subColumns.map((col, i) =>
          col[r] ? UnitCell(col[r]) : React.createElement(View, { style: styles.td, key: `blank-${i}-${r}` })
        )
      )
    );
  }

  return React.createElement(
    View,
    { key },
    label ? React.createElement(Text, { style: styles.groupLabel }, `${label} (${groupUnits.length})`) : null,
    React.createElement(View, { style: styles.table }, headerRow, ...bodyRows)
  );
}

function CompletionDocument({ job, units, crew, customer, companyName, companyLogoUrl, companyPhone, companyEmail }: CompletionPdfProps) {
  const servicedCount = units.filter((u) => u.serviced).length;
  const notOnSiteCount = units.filter((u) => u.not_on_site).length;

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
  const rowsPerColumn = rowsPerColumnFor(groups.length);

  const typeBreakdown = groups
    .filter((g) => g.label)
    .map((g) => `${g.units.filter((u) => u.serviced).length}-${g.label}s`)
    .join(" ");

  const unitsWithNotes = units.filter((u) => u.notes?.trim());

  const today = new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });

  return React.createElement(
    Document,
    {},
    React.createElement(
      Page,
      { size: "LETTER", style: styles.page },
      React.createElement(
        View,
        { style: styles.header },
        React.createElement(
          View,
          {},
          React.createElement(Text, { style: styles.companyName }, companyName),
          companyPhone ? React.createElement(Text, { style: styles.companyLine }, `Phone ${companyPhone}`) : null,
          companyEmail ? React.createElement(Text, { style: styles.companyLine }, `Email ${companyEmail}`) : null
        ),
        companyLogoUrl ? React.createElement(Image, { src: companyLogoUrl, style: styles.logo }) : null,
        React.createElement(
          View,
          { style: styles.dateBlock },
          React.createElement(Text, { style: styles.dateLabel }, "Date"),
          React.createElement(Text, { style: styles.dateValue }, job.completed_at ? job.completed_at.slice(0, 10) : today)
        )
      ),
      React.createElement(
        View,
        { style: styles.metaRow },
        React.createElement(
          View,
          { style: styles.metaLeft },
          React.createElement(Text, { style: styles.metaLabel }, "Order #"),
          React.createElement(Text, { style: styles.metaValue }, job.job_number ? formatWorkOrderNumber(job.job_number) : "WO-PENDING"),
          React.createElement(Text, { style: styles.metaLabel }, "Units Serviced"),
          React.createElement(
            Text,
            { style: styles.metaValue },
            typeBreakdown || `${servicedCount} of ${units.length}`
          )
        ),
        React.createElement(
          View,
          { style: styles.customerBox },
          React.createElement(Text, { style: styles.metaLabel }, "Customer"),
          React.createElement(Text, { style: styles.customerName }, customer?.name ?? job.client_name),
          customer?.address
            ? customer.address
                .split(",")
                .map((line, i) => React.createElement(Text, { style: styles.customerLine, key: i }, line.trim()))
            : null
        )
      ),
      ...groups.map((g, i) =>
        UnitGroup(showGroupLabels ? g.label ?? "Unit" : null, g.units, `group-${i}`, rowsPerColumn)
      ),
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
      React.createElement(Text, {
        style: styles.pageNumber,
        fixed: true,
        render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
          totalPages > 1 ? `Page ${pageNumber} of ${totalPages}` : "",
      })
    )
  );
}

export async function renderCompletionPdf(props: CompletionPdfProps): Promise<Buffer> {
  return renderToBuffer(CompletionDocument(props) as any);
}
