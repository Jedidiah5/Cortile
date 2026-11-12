import { createServiceClient } from "@/lib/supabase/server";
import { extractOnCallNumber } from "@/lib/format";
import { isEmergencyText } from "@/lib/ai/schemas";

export type Building = {
  id: string;
  slug: string;
  name: string;
  manager_name: string;
};

export type InboxMessage = {
  id: string;
  building_id: string;
  body: string;
  created_at: string;
  status: string;
  category: string | null;
  urgency: string | null;
  flat: string | null;
  mentioned_flat: string | null;
  summary: string | null;
  is_question: boolean | null;
  incident_id: string | null;
  resident: { id: string; name: string };
};

export type InboxIncident = {
  id: string;
  building_id: string;
  title: string;
  category: string;
  status: string;
  opened_at: string;
  report_count: number;
  first_report_at: string;
  messages: InboxMessage[];
};

export type InboxData = {
  building: Building;
  incidents: InboxIncident[];
  conversations: InboxMessage[];
  emergencies: InboxMessage[];
  onCallNumber: string | null;
};

export async function listBuildings(): Promise<Building[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("buildings")
    .select("id, slug, name, manager_name")
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getBuildingBySlug(slug: string): Promise<Building | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("buildings")
    .select("id, slug, name, manager_name")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function getOnCallNumber(buildingId: string): Promise<string | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("doc_chunks")
    .select("text, documents!inner(doc_type)")
    .eq("building_id", buildingId)
    .eq("documents.doc_type", "emergency-policy")
    .ilike("section", "%Who to call%");
  if (error) throw new Error(error.message);
  for (const chunk of data ?? []) {
    const num = extractOnCallNumber(chunk.text);
    if (num) return num;
  }
  return null;
}

export async function getInboxData(buildingId: string): Promise<Omit<InboxData, "building">> {
  const supabase = createServiceClient();

  const [messagesRes, incidentsRes, onCallNumber] = await Promise.all([
    supabase
      .from("messages")
      .select(
        "id, building_id, body, created_at, status, category, urgency, flat, mentioned_flat, summary, is_question, incident_id, resident:residents!inner(id, name)",
      )
      .eq("building_id", buildingId)
      .order("created_at", { ascending: false }),
    supabase
      .from("incidents")
      .select("id, building_id, title, category, status, opened_at")
      .eq("building_id", buildingId)
      .neq("status", "resolved")
      .order("opened_at", { ascending: false }),
    getOnCallNumber(buildingId),
  ]);

  if (messagesRes.error) throw new Error(messagesRes.error.message);
  if (incidentsRes.error) throw new Error(incidentsRes.error.message);

  const messages = (messagesRes.data ?? []).map((m) => {
    const residentRaw = m.resident as unknown as
      | { id: string; name: string }
      | { id: string; name: string }[];
    const resident = Array.isArray(residentRaw) ? residentRaw[0] : residentRaw;
    return {
      ...m,
      resident: resident ?? { id: "", name: "Unknown" },
    } as InboxMessage;
  });

  const byIncident = new Map<string, InboxMessage[]>();
  for (const m of messages) {
    if (!m.incident_id) continue;
    const list = byIncident.get(m.incident_id) ?? [];
    list.push(m);
    byIncident.set(m.incident_id, list);
  }

  const incidents: InboxIncident[] = (incidentsRes.data ?? []).map((inc) => {
    const msgs = (byIncident.get(inc.id) ?? []).slice().sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    return {
      ...inc,
      report_count: msgs.length,
      first_report_at: msgs[0]?.created_at ?? inc.opened_at,
      messages: msgs,
    };
  });

  const conversations = messages.filter((m) => !m.incident_id);

  const emergencies = messages.filter(
    (m) => m.urgency === "emergency" || isEmergencyText(m.body),
  );

  return { incidents, conversations, emergencies, onCallNumber };
}

export async function listUnitsForBuilding(buildingId: string): Promise<
  { flat_no: string; resident_name: string }[]
> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("residents")
    .select("name, units!inner(flat_no)")
    .eq("building_id", buildingId);
  if (error) throw new Error(error.message);

  const rows = (data ?? []).map((r) => {
    const unit = r.units as unknown as { flat_no: string } | { flat_no: string }[];
    const flat_no = Array.isArray(unit) ? unit[0]?.flat_no : unit?.flat_no;
    return { flat_no: flat_no ?? "", resident_name: r.name };
  });

  return rows
    .filter((r) => r.flat_no)
    .sort((a, b) => Number(a.flat_no) - Number(b.flat_no));
}
