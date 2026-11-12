import { formatChipLabel, formatIncidentStatus } from "@/lib/format";

const urgencyClass: Record<string, string> = {
  emergency: "bg-danger-soft text-danger",
  high: "bg-[#f8edd9] text-[#8a6a1f]",
  normal: "bg-line-3 text-ink-2",
  low: "bg-panel text-muted",
};

export function CategoryChip({ category }: { category: string | null }) {
  if (!category) return null;
  return (
    <span className="bg-panel px-1.5 py-0.5 text-[11px] font-medium capitalize text-ink-2">
      {formatChipLabel(category)}
    </span>
  );
}

export function UrgencyChip({ urgency }: { urgency: string | null }) {
  if (!urgency) return null;
  return (
    <span
      className={`px-1.5 py-0.5 text-[11px] font-medium capitalize ${
        urgencyClass[urgency] ?? "bg-panel text-ink-2"
      }`}
    >
      {urgency}
    </span>
  );
}

export function StatusChip({ status }: { status: string }) {
  return (
    <span className="bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent">
      {formatIncidentStatus(status)}
    </span>
  );
}

/** Shown when triage has not run or failed (status new / untriaged). */
export function NotTriagedChip({ status }: { status: string }) {
  if (status !== "new" && status !== "untriaged") return null;
  return (
    <span className="bg-[#f8edd9] px-1.5 py-0.5 text-[11px] font-medium text-[#8a6a1f]">
      Not triaged
    </span>
  );
}
