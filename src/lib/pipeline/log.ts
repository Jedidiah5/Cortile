import type { SupabaseClient } from "@supabase/supabase-js";

export async function logAiEvent(
  supabase: SupabaseClient,
  event: {
    building_id: string | null;
    step: string;
    ref_id: string | null;
    input: unknown;
    output: unknown;
    ok: boolean;
  },
): Promise<void> {
  const { error } = await supabase.from("ai_events").insert({
    building_id: event.building_id,
    step: event.step,
    ref_id: event.ref_id,
    input: event.input,
    output: event.output,
    ok: event.ok,
  });
  if (error) {
    console.warn("ai_events insert failed:", error.message);
  }
}
