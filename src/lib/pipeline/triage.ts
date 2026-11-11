import type { SupabaseClient } from "@supabase/supabase-js";
import { claudeJson, fastModel } from "@/lib/ai/claude";
import { embed } from "@/lib/ai/embed";
import { TRIAGE_SYSTEM, triageUser } from "@/lib/ai/prompts";
import {
  TriageSchema,
  maxUrgency,
  type Triage,
  type Urgency,
} from "@/lib/ai/schemas";
import { checkEmergency } from "@/lib/pipeline/emergency";
import { logAiEvent } from "@/lib/pipeline/log";
import { parseWithRetry } from "@/lib/pipeline/parse";

type MessageRow = {
  id: string;
  building_id: string;
  body: string;
  flat: string | null;
};

/**
 * Triage a message: emergency keyword check → Claude → Zod → merge urgency →
 * embed → save. On model failure after one retry: status = 'untriaged'.
 */
export async function triageMessage(
  supabase: SupabaseClient,
  message: MessageRow,
): Promise<{ urgency: Urgency | null; ok: boolean }> {
  const { isEmergency, floorUrgency } = checkEmergency(message.body);

  const callModel = () =>
    claudeJson(
      fastModel(),
      TRIAGE_SYSTEM,
      triageUser(message.body, message.flat),
    );

  let rawFirst: string;
  try {
    rawFirst = await callModel();
  } catch (err) {
    await logAiEvent(supabase, {
      building_id: message.building_id,
      step: "triage",
      ref_id: message.id,
      input: { body: message.body, flat: message.flat, isEmergency },
      output: { error: err instanceof Error ? err.message : String(err) },
      ok: false,
    });
    await markUntriaged(supabase, message.id);
    return { urgency: isEmergency ? "emergency" : null, ok: false };
  }

  const parsed = await parseWithRetry(TriageSchema, rawFirst, callModel);

  if (!parsed) {
    await logAiEvent(supabase, {
      building_id: message.building_id,
      step: "triage",
      ref_id: message.id,
      input: { body: message.body, flat: message.flat, isEmergency },
      output: { raw: rawFirst, error: "zod_failed_after_retry" },
      ok: false,
    });

    // Still force emergency fields if keywords matched.
    if (isEmergency) {
      await applyEmergencyFallback(supabase, message);
      return { urgency: "emergency", ok: false };
    }

    await markUntriaged(supabase, message.id);
    return { urgency: null, ok: false };
  }

  const triage: Triage = {
    ...parsed.data,
    urgency: maxUrgency(floorUrgency, parsed.data.urgency),
    flat: parsed.data.flat ?? message.flat,
  };

  let embedding: number[] | null = null;
  try {
    const [vec] = await embed([message.body]);
    embedding = vec ?? null;
  } catch (err) {
    console.warn(
      "message embed failed:",
      err instanceof Error ? err.message : err,
    );
  }

  const { error } = await supabase
    .from("messages")
    .update({
      category: triage.category,
      urgency: triage.urgency,
      flat: triage.flat,
      summary: triage.summary,
      is_question: triage.is_question,
      triage_json: triage,
      status: "triaged",
      ...(embedding ? { embedding } : {}),
    })
    .eq("id", message.id)
    .eq("building_id", message.building_id);

  if (error) {
    console.warn("triage update failed:", error.message);
    await markUntriaged(supabase, message.id);
    return { urgency: triage.urgency, ok: false };
  }

  await logAiEvent(supabase, {
    building_id: message.building_id,
    step: "triage",
    ref_id: message.id,
    input: { body: message.body, flat: message.flat, isEmergency },
    output: { triage, retried: parsed.retried },
    ok: true,
  });

  return { urgency: triage.urgency, ok: true };
}

async function markUntriaged(
  supabase: SupabaseClient,
  messageId: string,
): Promise<void> {
  await supabase
    .from("messages")
    .update({ status: "untriaged" })
    .eq("id", messageId);
}

async function applyEmergencyFallback(
  supabase: SupabaseClient,
  message: MessageRow,
): Promise<void> {
  let embedding: number[] | null = null;
  try {
    const [vec] = await embed([message.body]);
    embedding = vec ?? null;
  } catch {
    // ignore
  }

  await supabase
    .from("messages")
    .update({
      urgency: "emergency",
      category: "other",
      flat: message.flat,
      summary: message.body.slice(0, 140),
      is_question: false,
      status: "untriaged",
      triage_json: { fallback: true, reason: "emergency_keyword_zod_failed" },
      ...(embedding ? { embedding } : {}),
    })
    .eq("id", message.id)
    .eq("building_id", message.building_id);
}
