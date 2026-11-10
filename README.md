# Incidents for Cortile (prototype)

Groups duplicate resident messages about the same building problem into one incident, then sends one cited, manager-approved update to everyone affected.

Full spec: **BUILD_BRIEF.md**. Cursor rules: `.cursor/rules/project.mdc`.

## What's already here

| Path | What it is |
| --- | --- |
| `BUILD_BRIEF.md` | The build plan Cursor follows, phase by phase |
| `.cursor/rules/project.mdc` | Rules Cursor applies to every edit |
| `supabase/schema.sql` | Tables, pgvector, search functions, realtime |
| `src/lib/ai/schemas.ts` | Zod schemas + emergency keyword rules |
| `src/lib/ai/prompts.ts` | All model prompts |
| `data/buildings.json` | 2 buildings, 72 flats, 72 residents |
| `data/messages.json` | 36 resident messages with the expected outcome for each |
| `data/documents/` | 8 building documents (house rules, emergency policy, lift contract, ...) |
| `.env.example` | Keys and tuning settings |

## Setup

1. Create a Supabase project. In the SQL editor, run `supabase/schema.sql`.
2. Get API keys: Anthropic (console.anthropic.com) and Voyage AI (voyageai.com, free tier is enough).
3. Put this folder in a new empty repo and open it in Cursor.
4. Copy `.env.example` to `.env.local` and fill it in.

## First prompt to paste into Cursor (Agent mode)

> Read BUILD_BRIEF.md and .cursor/rules/project.mdc fully. Then do Phase 1 only: scaffold the Next.js app (App Router, TypeScript strict, Tailwind) in this folder without deleting the existing files, add the Supabase and Anthropic clients, write src/lib/ai/embed.ts for Voyage, and write scripts/seed.ts as described. Use the provided schemas.ts and prompts.ts as they are. When done, tell me the exact commands to run and what I should see. Stop after Phase 1.

Then for each next phase:

> Phase 1 works. Now do Phase N from BUILD_BRIEF.md only. Check its "Done when" before stopping.

## Testing tips

- `data/messages.json` has an `expected` field for each message. After `npx tsx scripts/seed.ts --process`, compare what the pipeline did with what was expected. Tune `SIMILARITY_THRESHOLD` if the lift messages don't group, or if the entrance door message joins the lift incident.
- All names, phone numbers and companies in the data are fictional (phone numbers use Ofcom's drama range).
