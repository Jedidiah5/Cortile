import type { InboxMessage } from "@/lib/data/inbox";

export function EmergencyBanner({
  emergencies,
  onCallNumber,
}: {
  emergencies: InboxMessage[];
  onCallNumber: string | null;
}) {
  if (emergencies.length === 0) return null;

  const latest = emergencies[0];

  return (
    <div className="border-b border-red-200 bg-danger-soft px-4 py-3 sm:px-6">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-danger">Emergency reported</p>
          <p className="text-sm text-red-800/90">
            Flat {latest.flat ?? "?"} · {latest.summary ?? latest.body.slice(0, 120)}
            {emergencies.length > 1 ? ` · +${emergencies.length - 1} more` : ""}
          </p>
        </div>
        {onCallNumber ? (
          <p className="text-sm font-medium text-danger">
            On-call: <span className="tabular-nums">{onCallNumber}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
