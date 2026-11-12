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
  const { id: messageId } = await params;
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

  const { data: message } = await supabase
    .from("messages")
    .select("id, building_id, resident_id")
    .eq("id", messageId)
    .maybeSingle();
  if (!message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  const { data: update } = await supabase
    .from("updates")
    .select("id, status")
    .eq("id", update_id)
    .eq("message_id", messageId)
    .maybeSingle();
  if (!update || update.status !== "draft") {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const { error: uErr } = await supabase
    .from("updates")
    .update({
      status: "sent",
      final_text,
      approved_by,
      sent_at: now,
    })
    .eq("id", update_id);

  if (uErr) {
    return NextResponse.json({ error: uErr.message }, { status: 500 });
  }

  await supabase.from("deliveries").insert({
    update_id,
    resident_id: message.resident_id,
  });

  return NextResponse.json({ ok: true, delivered_to: 1 });
}
