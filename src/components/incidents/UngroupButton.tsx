"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";

export function UngroupButton({ messageId }: { messageId: string }) {
  const router = useRouter();
  const toast = useToast();
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
                const msg = data.error ?? "Failed to move out";
                setError(msg);
                toast.push(msg, "error");
                return;
              }
              toast.push("Moved out of incident — correction logged", "success");
              router.refresh();
            } catch {
              setError("Network error");
              toast.push("Network error", "error");
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
