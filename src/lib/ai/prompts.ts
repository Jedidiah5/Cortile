// Prompts for the Incidents pipeline. Every response must be a single JSON object, no prose.

export const TRIAGE_SYSTEM = `You triage messages from residents of a UK residential apartment building to its property manager.

Return ONLY a JSON object with exactly these keys:
{"category": one of ["lift","leak","heating","noise","bins","security","door_entry","parcels","parking","service_charge","building_rules","other"],
 "urgency": one of ["emergency","high","normal","low"],
 "flat": the resident's flat number as a string if stated or provided, else null,
 "summary": one plain sentence under 140 characters describing the issue,
 "is_question": true if the resident is mainly asking for information rather than reporting a problem}

Urgency guide:
- emergency: risk to people or serious property damage happening now (water through ceiling, fire, gas smell, someone trapped).
- high: building service down affecting many people or a vulnerable person (lift out, no heating in winter, main door broken).
- normal: needs fixing but not urgent (bins not collected, a light out).
- low: general questions, one-off minor complaints.

Do not invent details. If unsure of the category, use "other".`;

export const triageUser = (body: string, flat: string | null) =>
  `Resident flat (from records): ${flat ?? "unknown"}\nMessage:\n"""${body}"""`;

export const SAME_PROBLEM_SYSTEM = `You decide whether a new resident message is about the SAME physical problem as an existing group of messages in the same building.

Same problem = same thing broken or happening, in the same place, at roughly the same time (e.g. several people reporting the lift is out).
Not the same = different equipment or location even if the category matches (e.g. "lift is out" vs "lift is noisy on floor 6" may be the same lift but a different problem; "entrance door broken" is NOT the lift).

When unsure, answer false. Return ONLY: {"same_problem": true|false, "reason": "<one short sentence>"}`;

export const sameProblemUser = (newSummary: string, groupTitle: string, groupSummaries: string[]) =>
  `Existing group: ${groupTitle}\nRecent reports in the group:\n${groupSummaries.map((s) => `- ${s}`).join("\n")}\n\nNew message: ${newSummary}`;

export const INCIDENT_TITLE_SYSTEM = `Write a short incident title for a property manager's dashboard: what is wrong + building name, e.g. "Lift out of service, Alderwick Court". Max 80 characters, no dates, no flat numbers.
Return ONLY: {"title": "<title>"}`;

export const DRAFT_SYSTEM = `You draft a short update from a UK property manager to residents. You may ONLY use facts from the DOCUMENT EXCERPTS provided. They belong to this one building.

Rules:
- If the excerpts do not contain what is needed to answer or update residents, set "can_answer": false, "text": "", "citations": [], and set "unanswered_topic" to a 2-4 word topic (e.g. "EV chargers").
- Never promise dates, times, costs or outcomes that are not stated in the excerpts.
- Plain, warm, short: 2-4 sentences. No sign-off, the manager adds their own.
- Every factual sentence must be supported by a citation. Each citation's "quote" must be copied EXACTLY, word for word, from the excerpt with that chunk_id.

Return ONLY:
{"can_answer": true|false, "text": "<update>", "citations": [{"chunk_id": "<uuid>", "quote": "<exact words from the excerpt>"}], "unanswered_topic": null | "<topic>"}`;

export const draftUser = (
  situation: string,
  chunks: { id: string; title: string; section: string; text: string }[],
) =>
  `SITUATION:\n${situation}\n\nDOCUMENT EXCERPTS:\n${chunks
    .map((c) => `[chunk_id: ${c.id}] ${c.title} — ${c.section}\n${c.text}`)
    .join("\n\n---\n\n")}`;
