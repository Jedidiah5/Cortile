import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { processMessage } from "@/lib/pipeline";

const BodySchema = z.object({
  building_slug: z.string().min(1),
  flat: z.string().min(1),
  body: z.string().min(1).max(2000),
});

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { building_slug, flat, body } = parsed.data;
  const supabase = createServiceClient();

  const { data: building, error: bErr } = await supabase
    .from("buildings")
    .select("id")
    .eq("slug", building_slug)
    .maybeSingle();
  if (bErr || !building) {
    return NextResponse.json({ error: "Building not found" }, { status: 404 });
  }

  const { data: residents, error: rErr } = await supabase
    .from("residents")
    .select("id, units!inner(flat_no)")
    .eq("building_id", building.id);
  if (rErr) {
    return NextResponse.json({ error: rErr.message }, { status: 500 });
  }

  const resident = (residents ?? []).find((r) => {
    const unit = r.units as unknown as { flat_no: string } | { flat_no: string }[];
    const flatNo = Array.isArray(unit) ? unit[0]?.flat_no : unit?.flat_no;
    return flatNo === flat;
  });

  if (!resident) {
    return NextResponse.json(
      { error: `No resident for flat ${flat}` },
      { status: 404 },
    );
  }

  const { data: message, error: mErr } = await supabase
    .from("messages")
    .insert({
      building_id: building.id,
      resident_id: resident.id,
      body,
      flat,
      status: "new",
    })
    .select("id, building_id, created_at, status")
    .single();

  if (mErr || !message) {
    return NextResponse.json(
      { error: mErr?.message ?? "Insert failed" },
      { status: 500 },
    );
  }

  // Never drop the message if the pipeline fails.
  try {
    await processMessage(message.id);
  } catch (err) {
    console.warn("processMessage:", err instanceof Error ? err.message : err);
  }

  const { data: updated } = await supabase
    .from("messages")
    .select(
      "id, building_id, created_at, status, category, urgency, flat, summary, is_question",
    )
    .eq("id", message.id)
    .eq("building_id", building.id)
    .single();

  return NextResponse.json({ message: updated ?? message }, { status: 201 });
}
