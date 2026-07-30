import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { formatWorkOrderNumber } from "@/lib/format";

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: job } = await supabase
    .from("jobs")
    .select("job_number, client_name, pdf_url")
    .eq("id", params.id)
    .single();
  if (!job?.pdf_url) {
    return NextResponse.json({ error: "No completion PDF for this job yet." }, { status: 404 });
  }

  const serviceClient = createServiceRoleClient();
  const { data, error } = await serviceClient.storage.from("completion-pdfs").download(job.pdf_url);

  if (error || !data) {
    return NextResponse.json({ error: "Couldn't retrieve the PDF." }, { status: 500 });
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  const filename = `${formatWorkOrderNumber(job.job_number)}-${job.client_name.replace(/[^a-z0-9]+/gi, "-")}.pdf`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}
