"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DraftCard, type CitationChip } from "@/components/updates/DraftCard";
import { useToast } from "@/components/ui/Toast";

type DraftState =
  | null
  | { kind: "loading" }
  | { kind: "no_source"; topic: string }
  | { kind: "cannot_answer"; topic: string }
  | { kind: "ungrounded" }
  | { kind: "ok"; updateId: string; text: string; citations: CitationChip[] }
  | { kind: "sent"; deliveredTo: number };

export function IncidentActions({
  incidentId,
  status,
  initialDraft,
  deliveryCount,
}: {
  incidentId: string;
  status: string;
  initialDraft: {
    id: string;
    draft_text: string;
    citations: CitationChip[];
  } | null;
  deliveryCount: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState<DraftState>(
    initialDraft
      ? {
          kind: "ok",
          updateId: initialDraft.id,
          text: initialDraft.draft_text,
          citations: initialDraft.citations,
        }
      : null,
  );
  const [resolveNote, setResolveNote] = useState(
    "This issue is now resolved. Thank you for your patience.",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function runDraft() {
    setError(null);
    setDraft({ kind: "loading" });
    startTransition(async () => {
      try {
        const res = await fetch(`/api/incidents/${incidentId}/draft`, {
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
          setDraft(null);
          const msg = data.error ?? "Draft failed";
          setError(msg);
          toast.push(msg, "error");
          return;
        }
        if (data.status === "ok" && data.updateId && data.text) {
          setDraft({
            kind: "ok",
            updateId: data.updateId,
            text: data.text,
            citations: data.citations ?? [],
          });
          toast.push("Draft ready — review citations before sending", "success");
        } else if (data.status === "no_source") {
          setDraft({ kind: "no_source", topic: data.topic ?? "unknown" });
          toast.push("No source found in building documents", "info");
        } else if (data.status === "cannot_answer") {
          setDraft({ kind: "cannot_answer", topic: data.topic ?? "unknown" });
          toast.push("No source found in building documents", "info");
        } else {
          setDraft({ kind: "ungrounded" });
          toast.push("Could not ground a draft", "error");
        }
        router.refresh();
      } catch {
        setDraft(null);
        setError("Network error");
        toast.push("Network error", "error");
      }
    });
  }

  async function onApprove(updateId: string, finalText: string) {
    const res = await fetch(`/api/incidents/${incidentId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ update_id: updateId, final_text: finalText }),
    });
    const data = (await res.json()) as { error?: string; delivered_to?: number };
    if (!res.ok) throw new Error(data.error ?? "Approve failed");
    const delivered = data.delivered_to ?? 0;
    setDraft({ kind: "sent", deliveredTo: delivered });
    toast.push(
      `Update sent to ${delivered} ${delivered === 1 ? "resident" : "residents"}`,
      "success",
    );
    router.refresh();
  }

  function onResolve() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/incidents/${incidentId}/resolve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note: resolveNote }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          const msg = data.error ?? "Resolve failed";
          setError(msg);
          toast.push(msg, "error");
          return;
        }
        toast.push("Incident marked resolved", "success");
        router.refresh();
      } catch {
        setError("Network error");
        toast.push("Network error", "error");
      }
    });
  }

  return (
    <div className="mt-6 space-y-4">
      {status !== "resolved" ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={runDraft}
            disabled={pending || draft?.kind === "loading"}
            className="bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-[var(--clay-deep)] disabled:opacity-50"
          >
            {draft?.kind === "loading" ? "Drafting…" : "Draft update"}
          </button>
        </div>
      ) : null}

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {draft?.kind === "no_source" || draft?.kind === "cannot_answer" ? (
        <div className="rounded-xl border border-dashed border-border bg-surface p-4 text-sm">
          <p className="font-medium text-foreground">No source found</p>
          <p className="mt-1 text-muted">
            Nothing in this building&apos;s documents covers{" "}
            <span className="font-medium text-foreground">{draft.topic}</span>.
            Logged to Insights.
          </p>
        </div>
      ) : null}

      {draft?.kind === "ungrounded" ? (
        <div className="rounded-xl border border-dashed border-border bg-surface p-4 text-sm text-muted">
          Could not ground a draft in the retrieved documents.
        </div>
      ) : null}

      {draft?.kind === "ok" ? (
        <DraftCard
          updateId={draft.updateId}
          initialText={draft.text}
          citations={draft.citations}
          onApprove={onApprove}
        />
      ) : null}

      {draft?.kind === "sent" ? (
        <p className="rounded-xl border border-accent/30 bg-accent-soft px-4 py-3 text-sm text-accent">
          Update sent to {draft.deliveredTo} resident
          {draft.deliveredTo === 1 ? "" : "s"}.
        </p>
      ) : null}

      {status === "update_sent" && draft?.kind !== "sent" && deliveryCount > 0 ? (
        <p className="text-sm text-muted">
          Last update delivered to {deliveryCount}{" "}
          {deliveryCount === 1 ? "resident" : "residents"}.
        </p>
      ) : null}

      {status !== "resolved" ? (
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-sm font-semibold">Mark resolved</p>
          <p className="mt-1 text-xs text-muted">
            Manager-written closing note — no AI. Sent to everyone on the incident.
          </p>
          <textarea
            className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            rows={3}
            value={resolveNote}
            onChange={(e) => setResolveNote(e.target.value)}
          />
          <button
            type="button"
            disabled={pending || !resolveNote.trim()}
            onClick={onResolve}
            className="mt-3 border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-panel disabled:opacity-50"
          >
            Mark resolved
          </button>
        </div>
      ) : (
        <p className="text-sm font-medium text-accent">Incident resolved</p>
      )}
    </div>
  );
}
