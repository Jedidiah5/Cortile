import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";

const BodySchema = z.object({
  update_id: z.string().uuid(),
  final_text: z.string().min(1).max(2000),
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

  const { update_id, final_text, approved_by } = parsed.data;
  const supabase = createServiceClient();

  const { data: incident } = await supabase
    .from("incidents")
    .select("id, building_id, status")
    .eq("id", incidentId)
    .maybeSingle();
  if (!incident) {
    return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  }

  let { data: update } = await supabase
    .from("updates")
    .select("id, incident_id, status")
    .eq("id", update_id)
    .eq("incident_id", incidentId)
    .maybeSingle();

  // If the client holds a stale draft id (e.g. concurrent re-draft), use latest draft.
  if (!update || update.status !== "draft") {
    const { data: latest } = await supabase
      .from("updates")
      .select("id, incident_id, status")
      .eq("incident_id", incidentId)
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    update = latest;
  }
  if (!update || update.status !== "draft") {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }
  const resolvedUpdateId = update.id;

  const { data: messages } = await supabase
    .from("messages")
    .select("resident_id")
    .eq("building_id", incident.building_id)
    .eq("incident_id", incidentId);

  const residentIds = [
    ...new Set((messages ?? []).map((m) => m.resident_id).filter(Boolean)),
  ];

  const now = new Date().toISOString();

  const { error: uErr } = await supabase
    .from("updates")
    .update({
      status: "sent",
      final_text,
      approved_by,
      sent_at: now,
    })
    .eq("id", resolvedUpdateId)
    .eq("incident_id", incidentId);

  if (uErr) {
    return NextResponse.json({ error: uErr.message }, { status: 500 });
  }

  if (residentIds.length > 0) {
    const { error: dErr } = await supabase.from("deliveries").insert(
      residentIds.map((resident_id) => ({
        update_id: resolvedUpdateId,
        resident_id,
      })),
    );
    if (dErr) {
      return NextResponse.json({ error: dErr.message }, { status: 500 });
    }
  }

  const incidentPatch: {
    status: string;
    first_update_at?: string;
  } = { status: "update_sent" };
  if (incident.status === "open") {
    incidentPatch.first_update_at = now;
  }

  await supabase
    .from("incidents")
    .update(incidentPatch)
    .eq("id", incidentId)
    .eq("building_id", incident.building_id);

  await supabase
    .from("incidents")
    .update({ first_update_at: now })
    .eq("id", incidentId)
    .eq("building_id", incident.building_id)
    .is("first_update_at", null);

  return NextResponse.json({
    ok: true,
    delivered_to: residentIds.length,
    update_id: resolvedUpdateId,
  });
}
