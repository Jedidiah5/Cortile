import { createServiceClient } from "@/lib/supabase/server";
import { triageMessage } from "@/lib/pipeline/triage";

/**
 * Pipeline entry point. Seed --process and POST /api/messages call this.
 * Phase 3: triage (+ embed). Grouping lands in Phase 4.
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

  // Never lose the message — triage failures are handled inside triageMessage.
  await triageMessage(supabase, message);
}
