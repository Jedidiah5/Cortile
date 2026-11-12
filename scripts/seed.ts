/**
 * Seed script: loads /data into Supabase and embeds document chunks.
 * Usage: npx tsx scripts/seed.ts [--process] [--fresh-times]
 *
 * --process: after seeding, run the AI pipeline over messages in time order.
 * --fresh-times: set each message created_at from minutes_ago relative to now
 *   (needed so grouping's 24h window still covers the seed set at demo time).
 */
import { config } from "dotenv";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { embed } from "../src/lib/ai/embed";

config({ path: ".env.local" });

type UnitSeed = { flat_no: string; floor: number };
type ResidentSeed = { flat_no: string; name: string };
type BuildingSeed = {
  slug: string;
  name: string;
  manager_name: string;
  units: UnitSeed[];
  residents: ResidentSeed[];
};
type MessageSeed = {
  building: string;
  flat: string;
  minutes_ago: number;
  body: string;
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in .env.local`);
  return v;
}

function createSeedClient(): SupabaseClient {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/** Split a markdown document into chunks by ## headings. Keeps the heading. */
function chunkBySection(markdown: string): { section: string; text: string }[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const chunks: { section: string; text: string }[] = [];
  let section = "Introduction";
  let buf: string[] = [];

  const flush = () => {
    const text = buf.join("\n").trim();
    if (text.length > 0) chunks.push({ section, text });
    buf = [];
  };

  for (const line of lines) {
    const m = /^##\s+(.+)$/.exec(line);
    if (m) {
      flush();
      section = m[1].trim();
      buf.push(line);
    } else {
      buf.push(line);
    }
  }
  flush();
  return chunks;
}

function titleFromMarkdown(markdown: string, filename: string): string {
  const h1 = /^#\s+(.+)$/m.exec(markdown);
  if (h1) {
    // Strip trailing " — Building Name" / " - Building Name"
    return h1[1].replace(/\s+[—–-]\s+.*$/, "").trim();
  }
  return filename
    .replace(/\.md$/i, "")
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

async function clearAll(supabase: SupabaseClient): Promise<void> {
  // Child tables first; buildings cascades the rest via FKs where set.
  const tables = [
    "ai_events",
    "corrections",
    "deliveries",
    "updates",
    "unanswered_questions",
    "doc_chunks",
    "documents",
    "messages",
    "incidents",
    "residents",
    "units",
    "buildings",
  ] as const;

  for (const table of tables) {
    const { error } = await supabase.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) {
      // Some tables may be empty / RLS; surface clearly.
      console.warn(`  clear ${table}: ${error.message}`);
    }
  }
}

async function seedBuildings(
  supabase: SupabaseClient,
  buildings: BuildingSeed[],
): Promise<Map<string, string>> {
  const slugToId = new Map<string, string>();

  for (const b of buildings) {
    const { data: building, error } = await supabase
      .from("buildings")
      .insert({
        slug: b.slug,
        name: b.name,
        manager_name: b.manager_name,
      })
      .select("id")
      .single();
    if (error || !building) throw new Error(`building ${b.slug}: ${error?.message}`);
    slugToId.set(b.slug, building.id);

    const { data: units, error: uErr } = await supabase
      .from("units")
      .insert(
        b.units.map((u) => ({
          building_id: building.id,
          flat_no: u.flat_no,
          floor: u.floor,
        })),
      )
      .select("id, flat_no");
    if (uErr || !units) throw new Error(`units ${b.slug}: ${uErr?.message}`);

    const flatToUnit = new Map(units.map((u) => [u.flat_no, u.id]));

    const { error: rErr } = await supabase.from("residents").insert(
      b.residents.map((r) => {
        const unit_id = flatToUnit.get(r.flat_no);
        if (!unit_id) throw new Error(`No unit ${r.flat_no} in ${b.slug}`);
        return {
          building_id: building.id,
          unit_id,
          name: r.name,
        };
      }),
    );
    if (rErr) throw new Error(`residents ${b.slug}: ${rErr.message}`);

    console.log(
      `  ${b.name}: ${b.units.length} units, ${b.residents.length} residents`,
    );
  }

  return slugToId;
}

async function seedDocuments(
  supabase: SupabaseClient,
  slugToId: Map<string, string>,
  dataDir: string,
): Promise<number> {
  const docsRoot = path.join(dataDir, "documents");

  // Collect all chunks first, then embed in one Voyage call (avoids 3 RPM free-tier limit).
  const pending: {
    document_id: string;
    building_id: string;
    section: string;
    text: string;
  }[] = [];

  for (const [slug, buildingId] of slugToId) {
    const dir = path.join(docsRoot, slug);
    let files: string[];
    try {
      files = (await readdir(dir)).filter((f) => f.endsWith(".md"));
    } catch {
      console.warn(`  no documents folder for ${slug}`);
      continue;
    }

    for (const file of files) {
      const markdown = await readFile(path.join(dir, file), "utf8");
      const title = titleFromMarkdown(markdown, file);
      const docType = file.replace(/\.md$/i, "");

      const { data: doc, error } = await supabase
        .from("documents")
        .insert({
          building_id: buildingId,
          title,
          doc_type: docType,
        })
        .select("id")
        .single();
      if (error || !doc) throw new Error(`document ${file}: ${error?.message}`);

      const sections = chunkBySection(markdown);
      for (const s of sections) {
        pending.push({
          document_id: doc.id,
          building_id: buildingId,
          section: s.section,
          text: s.text,
        });
      }
      console.log(`  ${slug}/${file}: ${sections.length} sections queued`);
    }
  }

  console.log(`  Embedding ${pending.length} chunks in one Voyage request…`);
  const embeddings = await embed(pending.map((p) => p.text));

  const rows = pending.map((p, i) => ({
    document_id: p.document_id,
    building_id: p.building_id,
    section: p.section,
    text: p.text,
    embedding: embeddings[i],
  }));

  const { error: cErr } = await supabase.from("doc_chunks").insert(rows);
  if (cErr) throw new Error(`chunks insert: ${cErr.message}`);

  return rows.length;
}

async function seedMessages(
  supabase: SupabaseClient,
  slugToId: Map<string, string>,
  messages: MessageSeed[],
  freshTimes: boolean,
): Promise<{ id: string; created_at: string }[]> {
  // Preload resident id by building slug + flat
  const residentByKey = new Map<string, string>();
  for (const [slug, buildingId] of slugToId) {
    const { data, error } = await supabase
      .from("residents")
      .select("id, units!inner(flat_no)")
      .eq("building_id", buildingId);
    if (error) throw new Error(`load residents ${slug}: ${error.message}`);
    for (const r of data ?? []) {
      const unit = r.units as unknown as { flat_no: string } | { flat_no: string }[];
      const flat = Array.isArray(unit) ? unit[0]?.flat_no : unit?.flat_no;
      if (flat) residentByKey.set(`${slug}:${flat}`, r.id);
    }
  }

  const inserted: { id: string; created_at: string }[] = [];
  // Sort oldest-first so created_at ordering is intuitive
  const sorted = [...messages].sort((a, b) => b.minutes_ago - a.minutes_ago);

  for (const m of sorted) {
    const buildingId = slugToId.get(m.building);
    if (!buildingId) throw new Error(`Unknown building slug: ${m.building}`);

    const residentId = residentByKey.get(`${m.building}:${m.flat}`);
    if (!residentId) {
      throw new Error(`resident flat ${m.flat} in ${m.building}: not found`);
    }

    // created_at is always now − minutes_ago on insert (cleared DB each seed).
    // --fresh-times makes that explicit for demo runs so the 24h grouping window fits.
    const created_at = new Date(
      Date.now() - m.minutes_ago * 60_000,
    ).toISOString();

    const { data: row, error } = await supabase
      .from("messages")
      .insert({
        building_id: buildingId,
        resident_id: residentId,
        body: m.body,
        flat: m.flat,
        created_at,
        status: "new",
      })
      .select("id, created_at")
      .single();

    if (error || !row) throw new Error(`message: ${error?.message}`);
    inserted.push(row);
  }

  console.log(
    `  ${inserted.length} messages (status=new${freshTimes ? ", fresh timestamps" : ""})`,
  );
  return inserted;
}

async function maybeProcess(
  messageIds: { id: string; created_at: string }[],
): Promise<void> {
  // Deferred import so seed works before the pipeline exists.
  try {
    const mod = await import("../src/lib/pipeline");
    if (typeof mod.processMessage !== "function") {
      console.warn("--process: processMessage not found in src/lib/pipeline");
      return;
    }
    console.log(`\nRunning pipeline over ${messageIds.length} messages…`);
    const ordered = [...messageIds].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    for (const m of ordered) {
      await mod.processMessage(m.id);
      process.stdout.write(".");
    }
    console.log("\nDone processing.");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `\n--process failed (pipeline may not be implemented yet): ${msg}`,
    );
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const doProcess = process.argv.includes("--process");
  const freshTimes = process.argv.includes("--fresh-times");
  const root = process.cwd();
  const dataDir = path.join(root, "data");

  console.log("Seeding Cortile…");
  if (freshTimes) {
    console.log("  --fresh-times: message created_at = now − minutes_ago");
  }
  const supabase = createSeedClient();

  // Warm Voyage key check early
  requireEnv("VOYAGE_API_KEY");

  const buildingsJson = JSON.parse(
    await readFile(path.join(dataDir, "buildings.json"), "utf8"),
  ) as { buildings: BuildingSeed[] };
  const messagesJson = JSON.parse(
    await readFile(path.join(dataDir, "messages.json"), "utf8"),
  ) as { messages: MessageSeed[] };

  console.log("Clearing existing data…");
  await clearAll(supabase);

  console.log("Buildings / units / residents…");
  const slugToId = await seedBuildings(supabase, buildingsJson.buildings);

  console.log("Documents + embeddings…");
  const chunkCount = await seedDocuments(supabase, slugToId, dataDir);

  console.log("Messages…");
  const seeded = await seedMessages(
    supabase,
    slugToId,
    messagesJson.messages,
    freshTimes,
  );

  // Counts
  const counts = await Promise.all(
    (["buildings", "messages", "documents", "doc_chunks"] as const).map(
      async (t) => {
        const { count, error } = await supabase
          .from(t)
          .select("*", { count: "exact", head: true });
        if (error) throw error;
        return [t, count ?? 0] as const;
      },
    ),
  );

  console.log("\nCounts:");
  for (const [t, c] of counts) console.log(`  ${t}: ${c}`);
  console.log(`  (chunks embedded this run: ${chunkCount})`);

  if (doProcess) {
    await maybeProcess(seeded);
  } else {
    console.log(
      "\nMessages left as status='new'. Re-run with --process after the pipeline is ready.",
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
