import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { PDFDocument } from "pdf-lib";

// Merges any set of completed work orders' PDFs into one file, regardless
// of which customer each belongs to - used for the weekly billing packet
// rather than a single customer's paperwork.
export async function POST(request: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  const { job_ids }: { job_ids: string[] } = await request.json();
  if (!Array.isArray(job_ids) || job_ids.length === 0) {
    return NextResponse.json({ error: "No work orders selected." }, { status: 400 });
  }

  const { data: jobs } = await supabase.from("jobs").select("id, pdf_url").in("id", job_ids);
  const orderedJobs = job_ids.map((id) => jobs?.find((j) => j.id === id)).filter((j): j is NonNullable<typeof j> => !!j?.pdf_url);

  if (orderedJobs.length === 0) {
    return NextResponse.json({ error: "None of those work orders have a PDF yet." }, { status: 400 });
  }

  const serviceClient = createServiceRoleClient();
  const mergedPdf = await PDFDocument.create();

  for (const job of orderedJobs) {
    const { data, error } = await serviceClient.storage.from("completion-pdfs").download(job.pdf_url as string);
    if (error || !data) continue;

    const sourceBytes = await data.arrayBuffer();
    const sourcePdf = await PDFDocument.load(sourceBytes);
    const copiedPages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
    copiedPages.forEach((page) => mergedPdf.addPage(page));
  }

  const mergedBytes = await mergedPdf.save();
  const filename = `Work-Orders-${new Date().toISOString().slice(0, 10)}.pdf`;

  return new NextResponse(Buffer.from(mergedBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
