import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { IncidentActions } from "@/components/incidents/IncidentActions";
import { UngroupButton } from "@/components/incidents/UngroupButton";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { createServiceClient } from "@/lib/supabase/server";
import { formatIncidentStatus } from "@/lib/format";
import type { CitationChip } from "@/components/updates/DraftCard";

export const instant = false;

type SentCitation = {
  chunk_id?: string;
  quote?: string;
  title?: string;
  section?: string;
};

export default async function IncidentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: incident } = await supabase
    .from("incidents")
    .select("id, title, status, category, building_id, buildings!inner(slug, name)")
    .eq("id", id)
    .maybeSingle();

  if (!incident) {
    return (
      <>
        <AppNav current="/inbox" />
        <main className="p-8 text-sm text-muted">Incident not found.</main>
      </>
    );
  }

  const building = incident.buildings as unknown as { slug: string; name: string };

  const [{ data: messages }, { data: drafts }, { data: sentUpdates }] =
    await Promise.all([
      supabase
        .from("messages")
        .select("id, body, flat, created_at, residents!inner(name)")
        .eq("building_id", incident.building_id)
        .eq("incident_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("updates")
        .select("id, draft_text, citations, status")
        .eq("incident_id", id)
        .eq("status", "draft")
        .order("created_at", { ascending: false })
        .limit(1),
      supabase
        .from("updates")
        .select(
          "id, final_text, sent_at, approved_by, citations, deliveries(id)",
        )
        .eq("incident_id", id)
        .eq("status", "sent")
        .order("sent_at", { ascending: false }),
    ]);

  const draftRow = drafts?.[0] ?? null;
  const initialDraft = draftRow
    ? {
        id: draftRow.id,
        draft_text: draftRow.draft_text,
        citations: (draftRow.citations as CitationChip[]) ?? [],
      }
    : null;

  const sentRows = sentUpdates ?? [];
  const latestDeliveries = sentRows[0]
    ? ((sentRows[0].deliveries as unknown as { id: string }[] | null) ?? [])
        .length
    : 0;

  return (
    <>
      <AppNav current="/inbox" />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <Link
          href={`/inbox?building=${building.slug}`}
          className="text-sm text-accent hover:underline"
        >
          ← Back to inbox
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">
          {incident.title}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {building.name} · {formatIncidentStatus(incident.status)} ·{" "}
          {incident.category}
        </p>

        <IncidentActions
          incidentId={incident.id}
          status={incident.status}
          initialDraft={initialDraft}
          deliveryCount={latestDeliveries}
        />

        {sentRows.length > 0 ? (
          <section className="mt-8">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
              Sent updates
            </h2>
            <ul className="mt-3 space-y-3">
              {sentRows.map((u) => {
                const dels =
                  (u.deliveries as unknown as { id: string }[] | null) ?? [];
                const cites = (u.citations as SentCitation[] | null) ?? [];
                return (
                  <li
                    key={u.id}
                    className="rounded-xl border border-border bg-surface p-4"
                  >
                    <p className="text-[15px] leading-relaxed text-ink">
                      {u.final_text ?? "—"}
                    </p>
                    <p className="mt-2 text-sm text-muted">
                      {u.sent_at ? (
                        <>
                          Sent <RelativeTime iso={u.sent_at} />
                        </>
                      ) : (
                        "Sent"
                      )}
                      {u.approved_by ? <> · by {u.approved_by}</> : null}
                      {" · "}
                      delivered to {dels.length}{" "}
                      {dels.length === 1 ? "resident" : "residents"}
                    </p>
                    {cites.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {cites.map((c, i) => (
                          <span
                            key={`${u.id}-${c.chunk_id ?? i}`}
                            title={c.quote}
                            className="rounded-md bg-accent-soft px-2 py-1 text-xs text-accent"
                          >
                            {c.title ?? "Document"}
                            {c.section ? `, ${c.section}` : ""}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <h2 className="mt-8 text-sm font-medium uppercase tracking-wide text-muted">
          Reports
        </h2>
        <ul className="mt-3 space-y-3">
          {(messages ?? []).map((m) => {
            const resident = m.residents as unknown as
              | { name: string }
              | { name: string }[];
            const name = Array.isArray(resident)
              ? resident[0]?.name
              : resident?.name;
            return (
              <li
                key={m.id}
                className="rounded-xl border border-border bg-surface p-4"
              >
                <p className="text-sm text-muted">
                  {name ?? "Resident"} · Flat {m.flat ?? "?"}
                </p>
                <p className="mt-1 text-[15px] leading-relaxed">{m.body}</p>
                {incident.status !== "resolved" ? (
                  <UngroupButton messageId={m.id} />
                ) : null}
              </li>
            );
          })}
        </ul>
      </main>
    </>
  );
}
