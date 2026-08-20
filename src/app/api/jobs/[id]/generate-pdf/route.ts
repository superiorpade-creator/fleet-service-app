import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { renderCompletionPdf } from "@/lib/pdf";
import type { Job, Profile, Unit, Customer } from "@/lib/types";
// Admin-only. Renders the completion PDF from the work order's current
// state and stores it, overwriting any previous version - so an admin can
// fix a mistake (via Edit Job) and re-run this as many times as needed.
// The work order must already be marked complete by crew (status ===
// "completed"); this step is intentionally separate from close-out so
// there's a review window in between.
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Only admins can generate the completion PDF" }, { status: 403 });
  }
  const { data: job } = await supabase.from("jobs").select("*").eq("id", params.id).single();
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (job.status !== "completed") {
    return NextResponse.json(
      { error: "This work order needs to be marked complete by crew before generating the PDF." },
      { status: 400 }
    );
  }
  const { data: units } = await supabase.from("units").select("*").eq("job_id", params.id).order("sort_order");
  const { data: crewLinks } = await supabase
    .from("job_crew")
    .select("profiles(id, full_name, role, created_at)")
    .eq("job_id", params.id);
  const crew = (crewLinks ?? []).map((c: any) => c.profiles as Profile).filter(Boolean);

  let customer: Customer | null = null;
  if (job.customer_id) {
    const { data: customerRow } = await supabase.from("customers").select("*").eq("id", job.customer_id).single();
    customer = (customerRow as Customer) ?? null;
  }

  const pdfBuffer = await renderCompletionPdf({
    job: job as Job,
    units: (units as Unit[]) ?? [],
    crew,
    customer,
    companyName: process.env.COMPANY_NAME || "Superior Wash",
    companyLogoUrl: process.env.COMPANY_LOGO_URL || undefined,
    companyPhone: process.env.COMPANY_PHONE || "610 636-0208",
    companyEmail: process.env.COMPANY_EMAIL || "pa-de@superiorwash.com",
  });
  const serviceClient = createServiceRoleClient();
  const storagePath = `${params.id}/completion.pdf`;
  const { error: uploadError } = await serviceClient.storage
    .from("completion-pdfs")
    .upload(storagePath, pdfBuffer, { contentType: "application/pdf", upsert: true });
  if (uploadError) {
    return NextResponse.json({ error: `PDF upload failed: ${uploadError.message}` }, { status: 500 });
  }
  const { error: updateError } = await supabase.from("jobs").update({ pdf_url: storagePath }).eq("id", params.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ ok: true, pdf_path: storagePath });
}
