import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { createServiceClient } from "@/lib/supabase/server";

export const instant = false;

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

  const { data: messages } = await supabase
    .from("messages")
    .select("id, body, flat, created_at, residents!inner(name)")
    .eq("building_id", incident.building_id)
    .eq("incident_id", id)
    .order("created_at", { ascending: true });

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
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">{incident.title}</h1>
        <p className="mt-1 text-sm text-muted">
          {building.name} · {incident.status} · {incident.category}
        </p>
        <p className="mt-6 rounded-lg border border-dashed border-border bg-surface p-4 text-sm text-muted">
          Draft + approve UI arrives in Phase 5.
        </p>
        <ul className="mt-6 space-y-3">
          {(messages ?? []).map((m) => {
            const resident = m.residents as unknown as
              | { name: string }
              | { name: string }[];
            const name = Array.isArray(resident) ? resident[0]?.name : resident?.name;
            return (
              <li key={m.id} className="rounded-xl border border-border bg-surface p-4">
                <p className="text-sm text-muted">
                  {name ?? "Resident"} · Flat {m.flat ?? "?"}
                </p>
                <p className="mt-1 text-[15px] leading-relaxed">{m.body}</p>
              </li>
            );
          })}
        </ul>
      </main>
    </>
  );
}
