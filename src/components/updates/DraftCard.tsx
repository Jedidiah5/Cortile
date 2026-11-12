"use client";

import { useState, useTransition } from "react";

export type CitationChip = {
  chunk_id: string;
  quote: string;
  title: string;
  section: string;
};

export function DraftCard({
  updateId,
  initialText,
  citations,
  onApprove,
  approveLabel = "Approve & send",
}: {
  updateId: string;
  initialText: string;
  citations: CitationChip[];
  onApprove: (updateId: string, finalText: string) => Promise<void>;
  approveLabel?: string;
}) {
  const [text, setText] = useState(initialText);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <p className="text-sm font-semibold text-foreground">Suggested update</p>
      <textarea
        className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed"
        rows={5}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {citations.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Cited:
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {citations.map((c) => (
              <span
                key={`${c.chunk_id}-${c.quote.slice(0, 12)}`}
                title={c.quote}
                className="rounded-md bg-accent-soft px-2 py-1 text-xs text-accent"
              >
                {c.title}, {c.section}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      <button
        type="button"
        disabled={pending || !text.trim()}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              await onApprove(updateId, text.trim());
            } catch (err) {
              setError(err instanceof Error ? err.message : "Approve failed");
            }
          });
        }}
        className="mt-4 bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-[var(--clay-deep)] disabled:opacity-50"
      >
        {pending ? "Sending…" : approveLabel}
      </button>
    </div>
  );
}
