import { createServiceClient } from "@/lib/supabase/server";
import { groupMessage } from "@/lib/pipeline/group";
import { triageMessage } from "@/lib/pipeline/triage";

/**
 * Pipeline entry point. Seed --process and POST /api/messages call this.
 * Phase 3–4: triage (+ embed) → group into incidents.
 */
export async function processMessage(messageId: string): Promise<void> {
  const supabase = createServiceClient();

  const { data: message, error } = await supabase
    .from("messages")
    .select("id, building_id, body, flat, status")
    .eq("id", messageId)
    .maybeSingle();

  if (error || !message) {
    console.warn("processMessage: message not found", messageId, error?.message);
    return;
  }

  // 1) Triage first so emergency urgency is saved (banner can show) before grouping.
  await triageMessage(supabase, message);

  const { data: fresh, error: freshErr } = await supabase
    .from("messages")
    .select("id, building_id, category, summary, embedding, urgency, status")
    .eq("id", messageId)
    .eq("building_id", message.building_id)
    .maybeSingle();

  if (freshErr || !fresh) {
    console.warn("processMessage: reload failed", freshErr?.message);
    return;
  }

  // 2) Group when we have enough signal (triaged or emergency fallback with embed).
  if (fresh.category && fresh.summary && fresh.embedding) {
    try {
      await groupMessage(supabase, fresh);
    } catch (err) {
      console.warn(
        "groupMessage:",
        err instanceof Error ? err.message : err,
      );
    }
  }
}
