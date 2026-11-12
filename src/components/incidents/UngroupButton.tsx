"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function UngroupButton({ messageId }: { messageId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              const res = await fetch(`/api/messages/${messageId}/ungroup`, {
                method: "POST",
              });
              const data = (await res.json()) as { error?: string };
              if (!res.ok) {
                setError(data.error ?? "Failed to move out");
                return;
              }
              router.refresh();
            } catch {
              setError("Network error");
            }
          });
        }}
        className="text-xs font-medium text-muted underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
      >
        {pending ? "Moving…" : "Move out of incident"}
      </button>
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
    </div>
  );
}
