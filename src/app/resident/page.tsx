import { AppNav } from "@/components/AppNav";
import { ResidentForm } from "@/components/resident/ResidentForm";
import { listBuildings, listUnitsForBuilding } from "@/lib/data/inbox";

export const instant = false;

export default async function ResidentPage() {
  const buildings = await listBuildings();
  const unitsBySlug: Record<string, { flat_no: string; resident_name: string }[]> = {};
  await Promise.all(
    buildings.map(async (b) => {
      unitsBySlug[b.slug] = await listUnitsForBuilding(b.id);
    }),
  );

  return (
    <>
      <AppNav current="/resident" />
      <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight">Send as resident</h1>
          <p className="mt-1 text-sm text-muted">
            Demo helper — posts into the manager inbox for the chosen building and flat.
          </p>
        </div>
        {buildings.length === 0 ? (
          <p className="text-sm text-muted">No buildings seeded yet.</p>
        ) : (
          <ResidentForm buildings={buildings} unitsBySlug={unitsBySlug} />
        )}
      </main>
    </>
  );
}
