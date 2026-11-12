/**
 * Process untriaged messages through the AI pipeline.
 * Usage: npx tsx scripts/process.ts [--building <slug>]
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { processMessage } from "../src/lib/pipeline";

config({ path: ".env.local" });

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in .env.local`);
  return v;
}

function flagValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

async function main(): Promise<void> {
  const buildingSlug = flagValue("--building");
  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  let buildingId: string | undefined;
  if (buildingSlug) {
    const { data, error } = await supabase
      .from("buildings")
      .select("id, slug, name")
      .eq("slug", buildingSlug)
      .maybeSingle();
    if (error || !data) {
      throw new Error(`Building not found: ${buildingSlug}`);
    }
    buildingId = data.id;
    console.log(`Processing ${data.name} (${data.slug})…`);
  } else {
    console.log("Processing all buildings…");
  }

  let query = supabase
    .from("messages")
    .select("id, status, created_at, building_id")
    .in("status", ["new", "untriaged"])
    .order("created_at", { ascending: true });

  if (buildingId) {
    query = query.eq("building_id", buildingId);
  }

  const { data: messages, error } = await query;
  if (error) throw new Error(error.message);

  const list = messages ?? [];
  console.log(`Found ${list.length} message(s) with status new/untriaged.\n`);

  let i = 0;
  for (const m of list) {
    i += 1;
    process.stdout.write(`[${i}/${list.length}] ${m.id.slice(0, 8)}… `);
    try {
      await processMessage(m.id);
      console.log("ok");
    } catch (err) {
      console.log("fail");
      console.warn(
        "  ",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // Summary scoped to the same building filter
  let summaryQuery = supabase
    .from("messages")
    .select("id, status, incident_id, category, urgency");
  if (buildingId) {
    summaryQuery = summaryQuery.eq("building_id", buildingId);
  }
  const { data: all, error: sErr } = await summaryQuery;
  if (sErr) throw new Error(sErr.message);

  const rows = all ?? [];
  const triaged = rows.filter((r) => r.status === "triaged").length;
  const untriaged = rows.filter((r) => r.status === "untriaged").length;
  const stillNew = rows.filter((r) => r.status === "new").length;
  const grouped = rows.filter((r) => r.incident_id != null).length;

  console.log("\nSummary:");
  console.log(`  total messages: ${rows.length}`);
  console.log(`  triaged:        ${triaged}`);
  console.log(`  untriaged:      ${untriaged}`);
  console.log(`  still new:      ${stillNew}`);
  console.log(`  in an incident: ${grouped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
