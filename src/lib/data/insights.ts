import { createServiceClient } from "@/lib/supabase/server";
import type { Building } from "@/lib/data/inbox";

export type UnansweredRow = {
  id: string;
  building_id: string;
  topic: string;
  example_question: string;
  asked_count: number;
  last_asked: string;
};

export type BuildingStats = {
  building: Building;
  open_incidents: number;
  avg_reports_per_incident: number | null;
  median_minutes_to_update: number | null;
  residents_updated: number;
  correction_count: number;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
  }
  return Math.round(sorted[mid]!);
}

export async function getInsights(): Promise<{
  unanswered: UnansweredRow[];
  stats: BuildingStats[];
}> {
  const supabase = createServiceClient();

  const { data: buildings, error: bErr } = await supabase
    .from("buildings")
    .select("id, slug, name, manager_name")
    .order("name");
  if (bErr) throw new Error(bErr.message);

  const { data: unanswered, error: uErr } = await supabase
    .from("unanswered_questions")
    .select("id, building_id, topic, example_question, asked_count, last_asked")
    .order("last_asked", { ascending: false });
  if (uErr) throw new Error(uErr.message);

  const stats: BuildingStats[] = [];

  for (const building of buildings ?? []) {
    const [{ data: incidents }, { count: openCount }] = await Promise.all([
      supabase
        .from("incidents")
        .select("id, status, opened_at, first_update_at")
        .eq("building_id", building.id),
      supabase
        .from("incidents")
        .select("*", { count: "exact", head: true })
        .eq("building_id", building.id)
        .neq("status", "resolved"),
    ]);

    const incidentList = incidents ?? [];
    const incidentIds = incidentList.map((i) => i.id);

    let avgReports: number | null = null;
    if (incidentList.length > 0) {
      const counts: number[] = [];
      for (const inc of incidentList) {
        const { count } = await supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("building_id", building.id)
          .eq("incident_id", inc.id);
        counts.push(count ?? 0);
      }
      avgReports =
        Math.round(
          (counts.reduce((a, b) => a + b, 0) / counts.length) * 10,
        ) / 10;
    }

    const minutes: number[] = [];
    for (const inc of incidentList) {
      if (!inc.first_update_at || !inc.opened_at) continue;
      const mins =
        (new Date(inc.first_update_at).getTime() -
          new Date(inc.opened_at).getTime()) /
        60_000;
      if (Number.isFinite(mins) && mins >= 0) minutes.push(mins);
    }

    let residentsUpdated = 0;
    if (incidentIds.length > 0) {
      const { data: sentUpdates } = await supabase
        .from("updates")
        .select("id")
        .in("incident_id", incidentIds)
        .eq("status", "sent");
      const updateIds = (sentUpdates ?? []).map((u) => u.id);
      if (updateIds.length > 0) {
        const { data: deliveries } = await supabase
          .from("deliveries")
          .select("resident_id")
          .in("update_id", updateIds);
        residentsUpdated = new Set(
          (deliveries ?? []).map((d) => d.resident_id),
        ).size;
      }
    }

    const { data: buildingMessages } = await supabase
      .from("messages")
      .select("id")
      .eq("building_id", building.id);
    const messageIds = (buildingMessages ?? []).map((m) => m.id);
    let correctionCount = 0;
    if (messageIds.length > 0) {
      const { count } = await supabase
        .from("corrections")
        .select("*", { count: "exact", head: true })
        .in("message_id", messageIds);
      correctionCount = count ?? 0;
    }

    stats.push({
      building,
      open_incidents: openCount ?? 0,
      avg_reports_per_incident: avgReports,
      median_minutes_to_update: median(minutes),
      residents_updated: residentsUpdated,
      correction_count: correctionCount,
    });
  }

  return {
    unanswered: (unanswered ?? []) as UnansweredRow[],
    stats,
  };
}
