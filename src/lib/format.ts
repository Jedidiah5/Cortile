export function formatRelativeTime(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  const mins = Math.round((now - then) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function formatChipLabel(value: string): string {
  return value.replace(/_/g, " ");
}

/** Pull the on-call number from an emergency-policy "Who to call" section. */
export function extractOnCallNumber(text: string): string | null {
  const m = text.match(/on-call line on\s+([\d\s]+)/i);
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}
