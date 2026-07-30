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

    // Zero units is a valid outcome, not an error — some accounts (rotating
    // fleets) use a blank template where the truck list isn't known ahead
    // of time. The job just starts empty and crew add units on the spot.
    return NextResponse.json({ units, suggestedClientName });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't parse that file.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
