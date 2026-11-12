import { AppNav } from "@/components/AppNav";
import { getInsights } from "@/lib/data/insights";
import { formatRelativeTime } from "@/lib/format";

export const instant = false;

export default async function InsightsPage() {
  const { unanswered, stats } = await getInsights();
  const buildingName = new Map(stats.map((s) => [s.building.id, s.building.name]));

  return (
    <>
      <AppNav current="/insights" />
      <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
        <div className="mb-8">
          <h1 className="text-xl font-semibold tracking-tight">Insights</h1>
          <p className="mt-1 text-sm text-muted">
            Gaps in building documents and incident response stats.
          </p>
        </div>

        <section className="mb-10">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
            Unanswered questions
          </h2>
          {unanswered.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No unanswered topics logged yet.</p>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-surface">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Topic</th>
                    <th className="px-4 py-3 font-medium">Example</th>
                    <th className="px-4 py-3 font-medium">Building</th>
                    <th className="px-4 py-3 font-medium">Times asked</th>
                    <th className="px-4 py-3 font-medium">Last asked</th>
                  </tr>
                </thead>
                <tbody>
                  {unanswered.map((row) => (
                    <tr key={row.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium">{row.topic}</td>
                      <td className="max-w-md px-4 py-3 text-stone-600">
                        {row.example_question}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {buildingName.get(row.building_id) ?? "—"}
                      </td>
                      <td className="px-4 py-3 tabular-nums">{row.asked_count}</td>
                      <td className="px-4 py-3 text-muted">
                        {formatRelativeTime(row.last_asked)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
            Per building
          </h2>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {stats.map((s) => (
              <div
                key={s.building.id}
                className="rounded-xl border border-border bg-surface p-5"
              >
                <h3 className="font-semibold tracking-tight">{s.building.name}</h3>
                <p className="text-xs text-muted">Manager · {s.building.manager_name}</p>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-muted">Open incidents</dt>
                    <dd className="mt-0.5 text-lg font-semibold tabular-nums">
                      {s.open_incidents}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Avg reports / incident</dt>
                    <dd className="mt-0.5 text-lg font-semibold tabular-nums">
                      {s.avg_reports_per_incident ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Median mins to update</dt>
                    <dd className="mt-0.5 text-lg font-semibold tabular-nums">
                      {s.median_minutes_to_update ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Residents updated</dt>
                    <dd className="mt-0.5 text-lg font-semibold tabular-nums">
                      {s.residents_updated}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Corrections</dt>
                    <dd className="mt-0.5 text-lg font-semibold tabular-nums">
                      {s.correction_count}
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
