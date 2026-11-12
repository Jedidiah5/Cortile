import type { SupabaseClient } from "@supabase/supabase-js";
import { claudeJson, draftModel } from "@/lib/ai/claude";
import { embed } from "@/lib/ai/embed";
import { DRAFT_SYSTEM, draftUser } from "@/lib/ai/prompts";
import { DraftSchema, type Draft } from "@/lib/ai/schemas";
import { logAiEvent } from "@/lib/pipeline/log";
import { parseWithRetry } from "@/lib/pipeline/parse";
import {
  verifyCitations,
  type ChunkForVerify,
  type StoredCitation,
} from "@/lib/pipeline/verify";

export type DraftResult =
  | { status: "no_source"; topic: string }
  | { status: "cannot_answer"; topic: string }
  | { status: "ungrounded" }
  | {
      status: "ok";
      updateId: string;
      text: string;
      citations: StoredCitation[];
    };

type DocChunkMatch = {
  id: string;
  document_id: string;
  title: string;
  section: string;
  text: string;
  similarity: number;
};

function asVectorParam(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

async function upsertUnanswered(
  supabase: SupabaseClient,
  buildingId: string,
  topic: string,
  exampleQuestion: string,
): Promise<void> {
  const normalised = topic.trim().slice(0, 60) || "unknown topic";

  const { data: existing } = await supabase
    .from("unanswered_questions")
    .select("id, asked_count")
    .eq("building_id", buildingId)
    .eq("topic", normalised)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("unanswered_questions")
      .update({
        asked_count: existing.asked_count + 1,
        last_asked: new Date().toISOString(),
        example_question: exampleQuestion,
      })
      .eq("id", existing.id)
      .eq("building_id", buildingId);
  } else {
    await supabase.from("unanswered_questions").insert({
      building_id: buildingId,
      topic: normalised,
      example_question: exampleQuestion,
      asked_count: 1,
    });
  }
}

async function retrieveChunks(
  supabase: SupabaseClient,
  buildingId: string,
  queryText: string,
): Promise<ChunkForVerify[]> {
  const threshold = Number(process.env.DOC_MATCH_THRESHOLD ?? "0.45");
  const [vec] = await embed([queryText], "query");
  if (!vec) return [];

  const { data, error } = await supabase.rpc("match_doc_chunks", {
    p_building_id: buildingId,
    p_embedding: asVectorParam(vec),
    p_threshold: threshold,
    p_limit: 5,
  });

  if (error) {
    console.warn("match_doc_chunks:", error.message);
    return [];
  }

  return ((data ?? []) as DocChunkMatch[]).map((c) => ({
    id: c.id,
    title: c.title,
    section: c.section,
    text: c.text,
  }));
}

async function callDraftModel(
  situation: string,
  chunks: ChunkForVerify[],
): Promise<string> {
  return claudeJson(
    draftModel(),
    DRAFT_SYSTEM,
    draftUser(
      situation,
      chunks.map((c) => ({
        id: c.id,
        title: c.title,
        section: c.section,
        text: c.text,
      })),
    ),
  );
}

async function generateVerifiedDraft(
  supabase: SupabaseClient,
  buildingId: string,
  refId: string,
  situation: string,
  chunks: ChunkForVerify[],
): Promise<
  | { ok: true; draft: Draft; citations: StoredCitation[] }
  | { ok: false; reason: "parse" | "ungrounded" | "cannot_answer"; topic?: string; draft?: Draft }
> {
  const call = () => callDraftModel(situation, chunks);

  let raw: string;
  try {
    raw = await call();
  } catch (err) {
    await logAiEvent(supabase, {
      building_id: buildingId,
      step: "draft",
      ref_id: refId,
      input: { situation, chunk_ids: chunks.map((c) => c.id) },
      output: { error: err instanceof Error ? err.message : String(err) },
      ok: false,
    });
    return { ok: false, reason: "parse" };
  }

  const parsed = await parseWithRetry(DraftSchema, raw, call);
  if (!parsed) {
    await logAiEvent(supabase, {
      building_id: buildingId,
      step: "draft",
      ref_id: refId,
      input: { situation, chunk_ids: chunks.map((c) => c.id) },
      output: { raw, error: "zod_failed_after_retry" },
      ok: false,
    });
    return { ok: false, reason: "parse" };
  }

  await logAiEvent(supabase, {
    building_id: buildingId,
    step: "draft",
    ref_id: refId,
    input: { situation, chunk_ids: chunks.map((c) => c.id) },
    output: { draft: parsed.data, retried: parsed.retried },
    ok: true,
  });

  if (!parsed.data.can_answer) {
    return {
      ok: false,
      reason: "cannot_answer",
      topic: parsed.data.unanswered_topic ?? "unanswered",
      draft: parsed.data,
    };
  }

  let verified = verifyCitations(parsed.data, chunks);
  await logAiEvent(supabase, {
    building_id: buildingId,
    step: "verify",
    ref_id: refId,
    input: { citations: parsed.data.citations },
    output: {
      kept: verified.citations.length,
      dropped: parsed.data.citations.length - verified.citations.length,
    },
    ok: verified.citations.length > 0,
  });

  if (verified.citations.length === 0) {
    // Redraft once
    let raw2: string;
    try {
      raw2 = await call();
    } catch {
      return { ok: false, reason: "ungrounded" };
    }
    const parsed2 = await parseWithRetry(DraftSchema, raw2, call);
    if (!parsed2 || !parsed2.data.can_answer) {
      return { ok: false, reason: "ungrounded" };
    }
    verified = verifyCitations(parsed2.data, chunks);
    await logAiEvent(supabase, {
      building_id: buildingId,
      step: "verify",
      ref_id: refId,
      input: { redraft: true, citations: parsed2.data.citations },
      output: { kept: verified.citations.length },
      ok: verified.citations.length > 0,
    });
    if (verified.citations.length === 0) {
      return { ok: false, reason: "ungrounded" };
    }
  }

  return { ok: true, draft: verified.draft, citations: verified.citations };
}

async function saveDraftUpdate(
  supabase: SupabaseClient,
  args: {
    buildingId: string;
    incidentId?: string;
    messageId?: string;
    text: string;
    citations: StoredCitation[];
  },
): Promise<string> {
  // Reuse the existing draft row when possible (avoids approve racing a delete).
  let existingId: string | null = null;
  if (args.incidentId) {
    const { data } = await supabase
      .from("updates")
      .select("id")
      .eq("incident_id", args.incidentId)
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    existingId = data?.id ?? null;
  } else if (args.messageId) {
    const { data } = await supabase
      .from("updates")
      .select("id")
      .eq("message_id", args.messageId)
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    existingId = data?.id ?? null;
  }

  if (existingId) {
    const { error } = await supabase
      .from("updates")
      .update({
        draft_text: args.text,
        citations: args.citations,
        final_text: null,
      })
      .eq("id", existingId);
    if (error) throw new Error(error.message);
    return existingId;
  }

  const { data, error } = await supabase
    .from("updates")
    .insert({
      incident_id: args.incidentId ?? null,
      message_id: args.messageId ?? null,
      draft_text: args.text,
      citations: args.citations,
      status: "draft",
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to save draft");
  return data.id;
}

/** Draft an update for an incident using only that building's documents. */
export async function draftIncidentUpdate(
  supabase: SupabaseClient,
  incidentId: string,
): Promise<DraftResult> {
  const { data: incident, error } = await supabase
    .from("incidents")
    .select("id, building_id, title, category")
    .eq("id", incidentId)
    .maybeSingle();

  if (error || !incident) throw new Error("Incident not found");

  const { data: messages } = await supabase
    .from("messages")
    .select("summary, body")
    .eq("building_id", incident.building_id)
    .eq("incident_id", incidentId)
    .order("created_at", { ascending: true });

  const summaries = (messages ?? [])
    .map((m) => m.summary ?? m.body)
    .filter(Boolean);
  const situation = `${incident.title}\n${summaries.map((s) => `- ${s}`).join("\n")}`;
  const queryText = `${incident.title}\n${summaries.join("\n")}`;

  const chunks = await retrieveChunks(supabase, incident.building_id, queryText);
  if (chunks.length === 0) {
    const topic = incident.category.replace(/_/g, " ");
    await upsertUnanswered(
      supabase,
      incident.building_id,
      topic,
      summaries[0] ?? incident.title,
    );
    return { status: "no_source", topic };
  }

  const result = await generateVerifiedDraft(
    supabase,
    incident.building_id,
    incidentId,
    situation,
    chunks,
  );

  if (!result.ok) {
    if (result.reason === "cannot_answer") {
      const topic = result.topic ?? "unanswered";
      await upsertUnanswered(
        supabase,
        incident.building_id,
        topic,
        summaries[0] ?? incident.title,
      );
      return { status: "cannot_answer", topic };
    }
    if (result.reason === "ungrounded") return { status: "ungrounded" };
    return { status: "ungrounded" };
  }

  const updateId = await saveDraftUpdate(supabase, {
    buildingId: incident.building_id,
    incidentId,
    text: result.draft.text,
    citations: result.citations,
  });

  return {
    status: "ok",
    updateId,
    text: result.draft.text,
    citations: result.citations,
  };
}

/** Suggest a reply for a standalone question (not in an incident). */
export async function draftQuestionReply(
  supabase: SupabaseClient,
  messageId: string,
): Promise<DraftResult> {
  const { data: message, error } = await supabase
    .from("messages")
    .select("id, building_id, body, summary, is_question, incident_id")
    .eq("id", messageId)
    .maybeSingle();

  if (error || !message) throw new Error("Message not found");
  if (message.incident_id) {
    throw new Error("Use incident draft for messages in an incident");
  }

  const situation = message.summary
    ? `${message.summary}\n\nResident asked: ${message.body}`
    : message.body;

  const chunks = await retrieveChunks(
    supabase,
    message.building_id,
    `${message.summary ?? ""}\n${message.body}`,
  );

  if (chunks.length === 0) {
    const topic = "no source";
    await upsertUnanswered(supabase, message.building_id, topic, message.body);
    return { status: "no_source", topic };
  }

  const result = await generateVerifiedDraft(
    supabase,
    message.building_id,
    messageId,
    situation,
    chunks,
  );

  if (!result.ok) {
    if (result.reason === "cannot_answer") {
      const topic = result.topic ?? "unanswered";
      await upsertUnanswered(supabase, message.building_id, topic, message.body);
      return { status: "cannot_answer", topic };
    }
    return { status: "ungrounded" };
  }

  const updateId = await saveDraftUpdate(supabase, {
    buildingId: message.building_id,
    messageId,
    text: result.draft.text,
    citations: result.citations,
  });

  return {
    status: "ok",
    updateId,
    text: result.draft.text,
    citations: result.citations,
  };
}
