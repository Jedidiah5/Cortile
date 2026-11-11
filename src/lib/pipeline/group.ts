import type { SupabaseClient } from "@supabase/supabase-js";
import { claudeJson, fastModel } from "@/lib/ai/claude";
import {
  INCIDENT_TITLE_SYSTEM,
  SAME_PROBLEM_SYSTEM,
  sameProblemUser,
} from "@/lib/ai/prompts";
import {
  IncidentTitleSchema,
  SameProblemSchema,
} from "@/lib/ai/schemas";
import { logAiEvent } from "@/lib/pipeline/log";
import { parseWithRetry } from "@/lib/pipeline/parse";

export type GroupableMessage = {
  id: string;
  building_id: string;
  category: string | null;
  summary: string | null;
  embedding: number[] | string | null;
  urgency: string | null;
};

type MatchRow = {
  id: string;
  incident_id: string | null;
  summary: string | null;
  similarity: number;
};

function asVectorParam(embedding: number[] | string): string {
  if (typeof embedding === "string") return embedding;
  return `[${embedding.join(",")}]`;
}

async function askSameProblem(
  supabase: SupabaseClient,
  buildingId: string,
  refId: string,
  newSummary: string,
  groupTitle: string,
  groupSummaries: string[],
): Promise<boolean> {
  const call = () =>
    claudeJson(
      fastModel(),
      SAME_PROBLEM_SYSTEM,
      sameProblemUser(newSummary, groupTitle, groupSummaries),
    );

  let raw: string;
  try {
    raw = await call();
  } catch (err) {
    await logAiEvent(supabase, {
      building_id: buildingId,
      step: "group_check",
      ref_id: refId,
      input: { newSummary, groupTitle, groupSummaries },
      output: { error: err instanceof Error ? err.message : String(err) },
      ok: false,
    });
    return false; // lean towards not grouping
  }

  const parsed = await parseWithRetry(SameProblemSchema, raw, call);
  const same = parsed?.data.same_problem === true;

  await logAiEvent(supabase, {
    building_id: buildingId,
    step: "group_check",
    ref_id: refId,
    input: { newSummary, groupTitle, groupSummaries },
    output: parsed
      ? { ...parsed.data, retried: parsed.retried }
      : { raw, error: "zod_failed", same_problem: false },
    ok: Boolean(parsed),
  });

  return same;
}

async function makeIncidentTitle(
  supabase: SupabaseClient,
  buildingId: string,
  refId: string,
  buildingName: string,
  summaries: string[],
  category: string,
): Promise<string> {
  const fallback = `${category.replace(/_/g, " ")} issue, ${buildingName}`.slice(
    0,
    80,
  );
  const user = `Building: ${buildingName}\nReports:\n${summaries
    .map((s) => `- ${s}`)
    .join("\n")}`;

  const call = () => claudeJson(fastModel(), INCIDENT_TITLE_SYSTEM, user);

  let raw: string;
  try {
    raw = await call();
  } catch (err) {
    await logAiEvent(supabase, {
      building_id: buildingId,
      step: "incident_title",
      ref_id: refId,
      input: { buildingName, summaries },
      output: { error: err instanceof Error ? err.message : String(err) },
      ok: false,
    });
    return fallback;
  }

  const parsed = await parseWithRetry(IncidentTitleSchema, raw, call);
  await logAiEvent(supabase, {
    building_id: buildingId,
    step: "incident_title",
    ref_id: refId,
    input: { buildingName, summaries },
    output: parsed
      ? { ...parsed.data, retried: parsed.retried }
      : { raw, error: "zod_failed" },
    ok: Boolean(parsed),
  });

  return parsed?.data.title ?? fallback;
}

/**
 * Group a triaged message into an existing or new incident.
 * Lean towards not grouping. Always filter by building_id.
 *
 * Emergencies still group; triage has already set urgency so the banner can show.
 */
export async function groupMessage(
  supabase: SupabaseClient,
  message: GroupableMessage,
): Promise<void> {
  if (!message.category || !message.summary || !message.embedding) {
    return;
  }

  const threshold = Number(process.env.SIMILARITY_THRESHOLD ?? "0.80");
  const windowHours = Number(process.env.GROUPING_WINDOW_HOURS ?? "24");
  const since = new Date(
    Date.now() - windowHours * 60 * 60 * 1000,
  ).toISOString();

  const { data: matchData, error: matchErr } = await supabase.rpc(
    "match_open_messages",
    {
      p_building_id: message.building_id,
      p_category: message.category,
      p_embedding: asVectorParam(message.embedding),
      p_since: since,
      p_threshold: threshold,
      p_limit: 10,
      p_exclude: message.id,
    },
  );

  if (matchErr) {
    console.warn("match_open_messages:", matchErr.message);
    await logAiEvent(supabase, {
      building_id: message.building_id,
      step: "group_check",
      ref_id: message.id,
      input: { error: "rpc_failed", detail: matchErr.message },
      output: null,
      ok: false,
    });
    return;
  }

  const matches = (matchData ?? []) as MatchRow[];

  await logAiEvent(supabase, {
    building_id: message.building_id,
    step: "group_check",
    ref_id: message.id,
    input: {
      phase: "similarity",
      category: message.category,
      threshold,
      since,
    },
    output: {
      matches: matches.map((m) => ({
        id: m.id,
        incident_id: m.incident_id,
        summary: m.summary,
        similarity: m.similarity,
      })),
    },
    ok: true,
  });

  if (matches.length === 0) return;

  // 1) Prefer attaching to an existing open incident (highest similarity first).
  const withIncident = matches
    .filter((m) => m.incident_id)
    .sort((a, b) => b.similarity - a.similarity);

  const triedIncidents = new Set<string>();
  for (const match of withIncident) {
    const incidentId = match.incident_id!;
    if (triedIncidents.has(incidentId)) continue;
    triedIncidents.add(incidentId);

    const { data: incident } = await supabase
      .from("incidents")
      .select("id, title, status")
      .eq("id", incidentId)
      .eq("building_id", message.building_id)
      .maybeSingle();

    if (!incident || incident.status === "resolved") continue;

    const { data: recent } = await supabase
      .from("messages")
      .select("summary")
      .eq("building_id", message.building_id)
      .eq("incident_id", incidentId)
      .order("created_at", { ascending: false })
      .limit(3);

    const summaries = (recent ?? [])
      .map((r) => r.summary)
      .filter((s): s is string => Boolean(s));

    const same = await askSameProblem(
      supabase,
      message.building_id,
      message.id,
      message.summary,
      incident.title,
      summaries.length > 0 ? summaries : [match.summary ?? incident.title],
    );

    if (same) {
      await supabase
        .from("messages")
        .update({ incident_id: incidentId })
        .eq("id", message.id)
        .eq("building_id", message.building_id);
      return;
    }
  }

  // 2) Else if ≥ 2 unattached matches pass same-problem → create incident.
  const unattached = matches.filter((m) => !m.incident_id);
  if (unattached.length < 2) return;

  const passing: MatchRow[] = [];
  for (const m of unattached) {
    const same = await askSameProblem(
      supabase,
      message.building_id,
      message.id,
      message.summary,
      m.summary ?? "Related report",
      [m.summary ?? ""],
    );
    if (same) passing.push(m);
  }

  if (passing.length < 2) return;

  const { data: building } = await supabase
    .from("buildings")
    .select("name")
    .eq("id", message.building_id)
    .maybeSingle();

  const buildingName = building?.name ?? "Building";
  const allSummaries = [
    message.summary,
    ...passing.map((p) => p.summary).filter((s): s is string => Boolean(s)),
  ];

  const title = await makeIncidentTitle(
    supabase,
    message.building_id,
    message.id,
    buildingName,
    allSummaries,
    message.category,
  );

  const { data: incident, error: incErr } = await supabase
    .from("incidents")
    .insert({
      building_id: message.building_id,
      title,
      category: message.category,
      status: "open",
    })
    .select("id")
    .single();

  if (incErr || !incident) {
    console.warn("create incident:", incErr?.message);
    return;
  }

  const memberIds = [message.id, ...passing.map((p) => p.id)];
  await supabase
    .from("messages")
    .update({ incident_id: incident.id })
    .eq("building_id", message.building_id)
    .in("id", memberIds);
}
