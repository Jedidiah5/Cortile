"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DraftCard, type CitationChip } from "@/components/updates/DraftCard";

type State =
  | null
  | { kind: "loading" }
  | { kind: "no_source"; topic: string }
  | { kind: "cannot_answer"; topic: string }
  | { kind: "ungrounded" }
  | { kind: "ok"; updateId: string; text: string; citations: CitationChip[] }
  | { kind: "sent" };

export function SuggestReply({ messageId }: { messageId: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function suggest() {
    setError(null);
    setState({ kind: "loading" });
    startTransition(async () => {
      try {
        const res = await fetch(`/api/messages/${messageId}/suggest`, {
          method: "POST",
        });
        const data = (await res.json()) as {
          status?: string;
          topic?: string;
          updateId?: string;
          text?: string;
          citations?: CitationChip[];
          error?: string;
        };
        if (!res.ok) {
          setState(null);
          setError(data.error ?? "Suggest failed");
          return;
        }
        if (data.status === "ok" && data.updateId && data.text) {
          setState({
            kind: "ok",
            updateId: data.updateId,
            text: data.text,
            citations: data.citations ?? [],
          });
        } else if (data.status === "no_source") {
          setState({ kind: "no_source", topic: data.topic ?? "unknown" });
        } else if (data.status === "cannot_answer") {
          setState({ kind: "cannot_answer", topic: data.topic ?? "unknown" });
        } else {
          setState({ kind: "ungrounded" });
        }
      } catch {
        setState(null);
        setError("Network error");
      }
    });
  }

  async function onApprove(updateId: string, finalText: string) {
    const res = await fetch(`/api/messages/${messageId}/approve-reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ update_id: updateId, final_text: finalText }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) throw new Error(data.error ?? "Approve failed");
    setState({ kind: "sent" });
    router.refresh();
  }

  return (
    <div className="mt-4 space-y-3">
      <button
        type="button"
        onClick={suggest}
        disabled={pending || state?.kind === "loading"}
        className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-stone-50 disabled:opacity-50"
      >
        {state?.kind === "loading" ? "Suggesting…" : "Suggest reply"}
      </button>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {state?.kind === "no_source" || state?.kind === "cannot_answer" ? (
        <div className="rounded-xl border border-dashed border-border bg-surface p-4 text-sm">
          <p className="font-medium">No source found</p>
          <p className="mt-1 text-muted">
            Topic <span className="font-medium text-foreground">{state.topic}</span>{" "}
            logged to Insights.
          </p>
        </div>
      ) : null}
      {state?.kind === "ungrounded" ? (
        <p className="text-sm text-muted">Could not ground a draft.</p>
      ) : null}
      {state?.kind === "ok" ? (
        <DraftCard
          updateId={state.updateId}
          initialText={state.text}
          citations={state.citations}
          onApprove={onApprove}
          approveLabel="Approve reply"
        />
      ) : null}
      {state?.kind === "sent" ? (
        <p className="text-sm text-accent">Reply marked as sent to the resident.</p>
      ) : null}
    </div>
  );
}
