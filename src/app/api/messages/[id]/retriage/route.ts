import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { processMessage } from "@/lib/pipeline";
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
    .select("id, building_id, status")
    .eq("id", messageId)
    .maybeSingle();

  if (!message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }
  if (!message.building_id) {
    return NextResponse.json(
      { error: "Message has no building" },
      { status: 400 },
    );
  }

  // Confirm the row is still scoped to this building before reprocessing.
  const { data: scoped } = await supabase
    .from("messages")
    .select("id")
    .eq("id", messageId)
    .eq("building_id", message.building_id)
    .maybeSingle();

  if (!scoped) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  try {
    await processMessage(messageId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Retriage failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const { data: fresh } = await supabase
    .from("messages")
    .select("id, status, category, urgency")
    .eq("id", messageId)
    .eq("building_id", message.building_id)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    status: fresh?.status ?? null,
    category: fresh?.category ?? null,
    urgency: fresh?.urgency ?? null,
  });
}
