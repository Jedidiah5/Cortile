import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { demoReadOnlyResponse } from "@/lib/demoGuard";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const readOnly = demoReadOnlyResponse();
  if (readOnly) return readOnly;

  const { id: messageId } = await params;
  const supabase = createServiceClient();

  const { data: message } = await supabase
    .from("messages")
    .select("id, building_id, incident_id")
    .eq("id", messageId)
    .maybeSingle();

  if (!message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }
  if (!message.incident_id) {
    return NextResponse.json(
      { error: "Message is not in an incident" },
      { status: 400 },
    );
  }

  const fromIncidentId = message.incident_id;

  const { error: updErr } = await supabase
    .from("messages")
    .update({ incident_id: null })
    .eq("id", messageId)
    .eq("building_id", message.building_id);

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  const { error: corrErr } = await supabase.from("corrections").insert({
    message_id: messageId,
    from_incident_id: fromIncidentId,
    by_user: "Priya",
  });

  if (corrErr) {
    return NextResponse.json({ error: corrErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    from_incident_id: fromIncidentId,
  });
}
