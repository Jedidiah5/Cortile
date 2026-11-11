import { formatChipLabel } from "@/lib/format";

const urgencyClass: Record<string, string> = {
  emergency: "bg-danger-soft text-danger",
  high: "bg-orange-50 text-orange-800",
  normal: "bg-stone-100 text-stone-700",
  low: "bg-stone-50 text-stone-500",
};

export function CategoryChip({ category }: { category: string | null }) {
  if (!category) return null;
  return (
    <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[11px] font-medium capitalize text-stone-600">
      {formatChipLabel(category)}
    </span>
  );
}

export function UrgencyChip({ urgency }: { urgency: string | null }) {
  if (!urgency) return null;
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[11px] font-medium capitalize ${
        urgencyClass[urgency] ?? "bg-stone-100 text-stone-600"
      }`}
    >
      {urgency}
    </span>
  );
}

export function StatusChip({ status }: { status: string }) {
  return (
    <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium capitalize text-accent">
      {formatChipLabel(status)}
    </span>
  );
}
