import { AppNav } from "@/components/AppNav";
import { InboxClient } from "@/components/inbox/InboxClient";
import {
  getBuildingBySlug,
  getInboxData,
  listBuildings,
  type InboxData,
} from "@/lib/data/inbox";

/** Inbox always reads live Supabase data — allow a blocking route. */
export const instant = false;

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ building?: string }>;
}) {
  const params = await searchParams;
  const buildings = await listBuildings();
  const slug =
    params.building ??
    buildings.find((b) => b.slug === "alderwick-court")?.slug ??
    buildings[0]?.slug;

  if (!slug || buildings.length === 0) {
    return (
      <>
        <AppNav current="/inbox" />
        <main className="p-8 text-sm text-muted">
          No buildings found. Run <code className="font-mono">npx tsx scripts/seed.ts</code> first.
        </main>
      </>
    );
  }

  const dataBySlug: Record<string, InboxData> = {};
  await Promise.all(
    buildings.map(async (b) => {
      const inbox = await getInboxData(b.id);
      dataBySlug[b.slug] = { building: b, ...inbox };
    }),
  );

  // Ensure selected slug resolves
  const selected = (await getBuildingBySlug(slug)) ?? buildings[0];

  return (
    <>
      <AppNav current="/inbox" />
      <InboxClient
        buildings={buildings}
        initialSlug={selected.slug}
        dataBySlug={dataBySlug}
      />
    </>
  );
}
