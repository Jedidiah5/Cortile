# Incidents for Cortile — Build Brief (for Cursor)

Read this whole file before writing code. Build in the phases below, in order. After each phase, stop and make sure its "Done when" checks pass before moving on.

## What we are building

A small web app that sits on top of a property manager's resident inbox. It:

1. **Triages** every resident message (category, urgency, flat) into validated JSON.
2. **Fast-paths emergencies** (water through ceiling, fire, gas, smoke) — shown at once, never waiting for AI or approval.
3. **Groups** messages about the same problem in the same building into one **incident** (e.g. 12 "lift broken" messages → 1 incident).
4. **Drafts one update** per incident using **only that building's documents** (RAG), with citations, which the manager edits and approves, then it's delivered to **every resident on the incident**.
5. **Logs questions the AI couldn't answer** from the documents, so managers see which documents are missing.
6. Lets the manager **move a message out of an incident** when grouping is wrong, and logs the correction.

Fake data only. Two buildings: **Alderwick Court** (manager: Priya) and **Harbrook Wharf**. Seed data lives in `/data`.

The look should feel like a calm, modern property-management inbox: list on the left, detail on the right, a "Suggested update · Cited:" card for drafts.

## Stack (do not change without asking)

- Next.js (App Router) + TypeScript (strict) + Tailwind CSS
- Supabase: Postgres + pgvector + Realtime (`@supabase/supabase-js`)
- Anthropic Claude API (`@anthropic-ai/sdk`)
  - `CLAUDE_FAST_MODEL` (triage, yes/no grouping check, incident titles)
  - `CLAUDE_DRAFT_MODEL` (drafting updates)
- Embeddings: Voyage AI (`voyage-3.5-lite`, 1024 dims) via `fetch`. Keep it behind one function `embed(texts: string[])` in `src/lib/ai/embed.ts` so the provider can be swapped.
- Zod for validating every model output
- Deploy target: Vercel

Architecture: a **modular monolith**. One Next.js app, but keep the AI pipeline in its own folder (`src/lib/pipeline/`) with no UI imports, so it could later move behind a queue.

## Folder layout

```
src/
  app/
    page.tsx                    -> redirect to /inbox
    inbox/page.tsx              -> manager inbox (conversations + incidents)
    incidents/[id]/page.tsx     -> incident detail, draft + approve
    resident/page.tsx           -> "send as resident" form (pick building + flat)
    insights/page.tsx           -> unanswered questions + stats
    api/messages/route.ts       -> POST new message -> runs pipeline
    api/incidents/[id]/draft/route.ts    -> POST draft update
    api/incidents/[id]/approve/route.ts  -> POST approve + deliver
    api/messages/[id]/ungroup/route.ts   -> POST move out of incident
  lib/
    supabase/server.ts, client.ts
    ai/claude.ts, embed.ts, schemas.ts, prompts.ts   (schemas.ts + prompts.ts are provided)
    pipeline/triage.ts, emergency.ts, group.ts, draft.ts, verify.ts
scripts/
  seed.ts                       -> loads /data into Supabase, embeds messages + doc chunks
supabase/schema.sql             -> provided
data/                           -> provided seed data
```

## Rules that must always hold

1. **Every query on messages, incidents, documents or chunks filters by `building_id`.** Grouping never crosses buildings.
2. **Emergency keywords are checked in code before any AI call.** The model can raise urgency, never lower it.
3. **Every model output is parsed with Zod.** On failure: retry once, then fall back (message stays untriaged / no grouping / no draft). Never crash, never lose a message.
4. **Drafts only use retrieved document chunks.** Every citation's `quote` must appear verbatim in its chunk (check in code). If no chunk is relevant → no draft, log to `unanswered_questions`.
5. **Nothing is sent to residents without manager approval.** Drafts never promise dates or costs the documents don't state.
6. **Lean towards not grouping.** A missed group costs time; a wrong group sends the wrong update.
7. Log every AI decision (`ai_events` table) with inputs, outputs and scores.

## Phase 1 — Project + database (Done when: tables exist, seed runs)

- Create the Next.js app, Tailwind, env loading. Copy `.env.example` to `.env.local`.
- Run `supabase/schema.sql` in the Supabase SQL editor.
- Write `scripts/seed.ts` (run with `npx tsx scripts/seed.ts`):
  - Insert buildings, units, residents from `data/buildings.json`.
  - Insert documents from `data/documents/<building-slug>/*.md`. **Chunk by `##` section** (one chunk per section, keep the section heading). Embed chunks, store in `doc_chunks`.
  - Insert messages from `data/messages.json`. `created_at = now() - minutes_ago`. Do **not** triage during seed — leave them `status = 'new'` so the pipeline can be demoed. Add a `--process` flag that runs the pipeline over all seeded messages in time order.
- Done when: `select count(*)` shows 2 buildings, ~40 messages, 8 documents, chunks with embeddings.

## Phase 2 — Inbox UI (Done when: Priya can browse messages)

- `/inbox`: building switcher at top (Alderwick Court / Harbrook Wharf). Left: list of **incidents first** (card: title, report count, first report time, status), then conversations not in an incident (resident, flat, preview, time, category + urgency chips). Right: selected item detail.
- `/resident`: form with building, flat, message → POST `/api/messages`.
- Emergency messages show a red banner at the top of the inbox with the on-call number from the building's emergency policy.

## Phase 3 — Triage (Done when: new messages get chips within ~2s)

- `pipeline/emergency.ts`: keyword check (see `EMERGENCY_PATTERNS` in `src/lib/ai/schemas.ts`).
- `pipeline/triage.ts`: call `CLAUDE_FAST_MODEL` with `TRIAGE_SYSTEM` + the message, parse with `TriageSchema`. Merge with the emergency check (max urgency wins). Save `category`, `urgency`, `flat`, `summary`, `is_question`, `triage_json`, set `status = 'triaged'`.
- Embed the message text and save `embedding`.

## Phase 4 — Grouping into incidents (Done when: the 3rd lift message creates an incident live)

`pipeline/group.ts`, runs after triage (skip if `urgency = 'emergency'` — emergencies still group, but only after the banner is shown):

1. Call `match_open_messages(building_id, category, embedding, since = now()-24h, threshold = SIMILARITY_THRESHOLD, limit 10)` (SQL function provided), excluding the message itself.
2. If any match has an `incident_id`: ask `CLAUDE_FAST_MODEL` the yes/no `SAME_PROBLEM` check (new message vs. the incident title + 3 recent summaries). Yes → attach.
3. Else if ≥ 2 unattached matches: run the same check against them; keep those that pass; if ≥ 2 pass → create an incident from the new message + those matches. Title from `INCIDENT_TITLE` prompt.
4. Otherwise leave it as a normal conversation.
5. Log similarity scores and the yes/no answers in `ai_events`.
- Supabase Realtime: subscribe the inbox to `incidents` and `messages` changes so the incident card appears live.

## Phase 5 — Drafting with citations (Done when: a cited draft can be approved and delivered)

`pipeline/draft.ts` + `pipeline/verify.ts`:

1. Query text = incident title + summaries. Embed it. Call `match_doc_chunks(building_id, embedding, threshold = DOC_MATCH_THRESHOLD, limit 5)`.
2. If no chunks → return `{ status: 'no_source' }`, upsert into `unanswered_questions`, show "No source found" in the UI.
3. Else call `CLAUDE_DRAFT_MODEL` with `DRAFT_SYSTEM` and the chunks (each labelled with `chunk_id`, document title, section). Parse with `DraftSchema`.
4. `verify.ts`: every citation's `quote` must appear (case-insensitive, whitespace-normalised) in the cited chunk's text. Drop failed citations; if the draft has zero valid citations, redraft once, then give up with "Could not ground a draft".
5. Save to `updates` (status `draft`, citations JSON). UI shows the card: draft text (editable), "Cited: <doc>, <section>" chips.
6. Approve → status `sent`, insert a `deliveries` row for **every resident with a message in the incident**, set incident status `update_sent`. "Mark resolved" → status `resolved`, sends a short closing note (manager-written, no AI needed).

Also for **questions that aren't incidents** (`is_question = true`): a "Suggest reply" button on the conversation that uses the same retrieval + draft + verify flow. No source → log to `unanswered_questions`.

## Phase 6 — Extras (Done when: demo script works end to end)

- "Move out of incident" on any message in an incident → clears `incident_id`, inserts into `corrections`.
- `/insights`: unanswered questions (question, times asked, last asked) + stats per building: open incidents, avg reports per incident, median minutes from first report to first update, residents updated, correction count.

## Phase 7 — Polish

- README with setup steps, architecture summary and a screenshot.
- Empty states, loading states, error toasts.
- Deploy to Vercel.

## Demo script (must work)

1. Send 4 lift messages from `/resident` for Alderwick Court → triage chips appear → the incident card forms at the 3rd.
2. Open incident → Draft update → cited draft ("Cited: Lift maintenance contract, Response times") → edit → Approve → all residents on it show as updated.
3. Send "water is pouring through my ceiling" → red emergency banner instantly.
4. Send "Can I install an EV charger in my space?" → Suggest reply → "No source found" → appears in `/insights`.
5. Move a wrongly grouped message out of an incident → correction logged.

## What NOT to do

- No auth/login for now (single demo manager). Keep `building_id` filtering anyway.
- Don't send real emails/SMS.
- Don't add extra AI steps not listed here.
- Don't put secrets in client components. All Claude/Voyage calls happen server-side.
