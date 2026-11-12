import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";

const BodySchema = z.object({
  note: z.string().min(1).max(2000),
  approved_by: z.string().default("Priya"),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: incidentId } = await params;
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { note, approved_by } = parsed.data;
  const supabase = createServiceClient();

  const { data: incident } = await supabase
    .from("incidents")
    .select("id, building_id")
    .eq("id", incidentId)
    .maybeSingle();
  if (!incident) {
    return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  }

  const { data: messages } = await supabase
    .from("messages")
    .select("resident_id")
    .eq("building_id", incident.building_id)
    .eq("incident_id", incidentId);

  const residentIds = [
    ...new Set((messages ?? []).map((m) => m.resident_id).filter(Boolean)),
  ];

  const now = new Date().toISOString();

  const { data: update, error: uErr } = await supabase
    .from("updates")
    .insert({
      incident_id: incidentId,
      draft_text: note,
      final_text: note,
      citations: [],
      status: "sent",
      approved_by,
      sent_at: now,
    })
    .select("id")
    .single();

  if (uErr || !update) {
    return NextResponse.json(
      { error: uErr?.message ?? "Failed to save note" },
      { status: 500 },
    );
  }

  if (residentIds.length > 0) {
    await supabase.from("deliveries").insert(
      residentIds.map((resident_id) => ({
        update_id: update.id,
        resident_id,
      })),
    );
  }

  await supabase
    .from("incidents")
    .update({ status: "resolved", resolved_at: now })
    .eq("id", incidentId)
    .eq("building_id", incident.building_id);

  return NextResponse.json({
    ok: true,
    delivered_to: residentIds.length,
  });
}
