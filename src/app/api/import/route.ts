import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseWorkbook } from "@/lib/excel";

export async function POST(request: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Only admins can import unit lists" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  try {
    const buffer = await file.arrayBuffer();
    const { units, suggestedClientName } = parseWorkbook(buffer);

    if (units.length === 0) {
      return NextResponse.json({ error: "No unit rows found in that file." }, { status: 400 });
    }

    return NextResponse.json({ units, suggestedClientName });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't parse that file.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
