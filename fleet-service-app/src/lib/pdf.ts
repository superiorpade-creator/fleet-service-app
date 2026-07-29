import React from "react";
import { Document, Page, Text, View, StyleSheet, renderToBuffer, Image } from "@react-pdf/renderer";
import type { Job, Unit, Profile } from "./types";
import { formatWorkOrderNumber } from "./format";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica", color: "#14181F" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20, borderBottom: "2 solid #14181F", paddingBottom: 12 },
  logo: { width: 120, height: 40, objectFit: "contain" },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  metaGrid: { flexDirection: "row", marginBottom: 16, gap: 24 },
  metaBlock: { flexDirection: "column" },
  metaLabel: { fontSize: 8, color: "#3E4C59", textTransform: "uppercase", marginBottom: 2 },
  metaValue: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  tableHeader: { flexDirection: "row", backgroundColor: "#14181F", color: "#FFFFFF", padding: 6, fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row", padding: 6, borderBottom: "1 solid #E3E1DB" },
  colUnit: { width: "25%" },
  colLocation: { width: "25%" },
  colType: { width: "20%" },
  colStatus: { width: "15%" },
  colNotes: { width: "15%" },
  statusServiced: { color: "#1F8A57", fontFamily: "Helvetica-Bold" },
  statusNotServiced: { color: "#D64545", fontFamily: "Helvetica-Bold" },
  footer: { marginTop: 24, paddingTop: 12, borderTop: "1 solid #E3E1DB", fontSize: 9, color: "#3E4C59" },
  summary: { marginTop: 16, fontSize: 10 },
});

interface CompletionPdfProps {
  job: Job;
  units: Unit[];
  crew: Profile[];
  companyName: string;
  companyLogoUrl?: string;
}

function CompletionDocument({ job, units, crew, companyName, companyLogoUrl }: CompletionPdfProps) {
  const servicedCount = units.filter((u) => u.serviced).length;

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
          React.createElement(Text, { style: styles.metaValue }, formatWorkOrderNumber(job.job_number))
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
          React.createElement(Text, { style: styles.metaValue }, job.scheduled_date)
        ),
        React.createElement(
          View,
          { style: styles.metaBlock },
          React.createElement(Text, { style: styles.metaLabel }, "Crew"),
          React.createElement(Text, { style: styles.metaValue }, crew.map((c) => c.full_name).join(", ") || "—")
        ),
        React.createElement(
          View,
          { style: styles.metaBlock },
          React.createElement(Text, { style: styles.metaLabel }, "Completed"),
          React.createElement(
            Text,
            { style: styles.metaValue },
            job.completed_at ? new Date(job.completed_at).toLocaleString() : "—"
          )
        )
      ),
      // Unit table
      React.createElement(
        View,
        { style: styles.tableHeader },
        React.createElement(Text, { style: styles.colUnit }, "Unit #"),
        React.createElement(Text, { style: styles.colLocation }, "Location"),
        React.createElement(Text, { style: styles.colType }, "Type"),
        React.createElement(Text, { style: styles.colStatus }, "Status"),
        React.createElement(Text, { style: styles.colNotes }, "Notes")
      ),
      ...units.map((unit) =>
        React.createElement(
          View,
          { style: styles.row, key: unit.id },
          React.createElement(Text, { style: styles.colUnit }, unit.unit_number),
          React.createElement(Text, { style: styles.colLocation }, unit.location || "—"),
          React.createElement(Text, { style: styles.colType }, unit.unit_type || "—"),
          React.createElement(
            Text,
            { style: [styles.colStatus, unit.serviced ? styles.statusServiced : styles.statusNotServiced] },
            unit.serviced ? "Serviced" : "Not Serviced"
          ),
          React.createElement(Text, { style: styles.colNotes }, unit.notes || "—")
        )
      ),
      // Summary
      React.createElement(
        View,
        { style: styles.summary },
        React.createElement(
          Text,
          {},
          `${servicedCount} of ${units.length} units serviced`
        )
      ),
      // Footer
      React.createElement(
        View,
        { style: styles.footer },
        React.createElement(Text, {}, `Work order generated ${new Date().toLocaleString()} — ${companyName}`)
      )
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
