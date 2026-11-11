"use client";

import { useMemo, useState, useTransition } from "react";
import type { Building } from "@/lib/data/inbox";

type UnitOption = { flat_no: string; resident_name: string };

export function ResidentForm({
  buildings,
  unitsBySlug,
}: {
  buildings: Building[];
  unitsBySlug: Record<string, UnitOption[]>;
}) {
  const [slug, setSlug] = useState(buildings[0]?.slug ?? "");
  const units = useMemo(() => unitsBySlug[slug] ?? [], [unitsBySlug, slug]);
  const [flat, setFlat] = useState(units[0]?.flat_no ?? "");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onBuildingChange(next: string) {
    setSlug(next);
    const nextUnits = unitsBySlug[next] ?? [];
    setFlat(nextUnits[0]?.flat_no ?? "");
    setOk(null);
    setError(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ building_slug: slug, flat, body }),
        });
        const data = (await res.json()) as { error?: string; message?: { id: string } };
        if (!res.ok) {
          setError(data.error ?? "Failed to send");
          return;
        }
        setOk(`Sent. Message id ${data.message?.id ?? ""}`);
        setBody("");
      } catch {
        setError("Network error");
      }
    });
  }

  const residentName = units.find((u) => u.flat_no === flat)?.resident_name;

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-lg space-y-4 rounded-xl border border-border bg-surface p-6">
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="building">
          Building
        </label>
        <select
          id="building"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          value={slug}
          onChange={(e) => onBuildingChange(e.target.value)}
        >
          {buildings.map((b) => (
            <option key={b.id} value={b.slug}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="flat">
          Flat
        </label>
        <select
          id="flat"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          value={flat}
          onChange={(e) => setFlat(e.target.value)}
        >
          {units.map((u) => (
            <option key={u.flat_no} value={u.flat_no}>
              Flat {u.flat_no} — {u.resident_name}
            </option>
          ))}
        </select>
        {residentName ? (
          <p className="mt-1 text-xs text-muted">Sending as {residentName}</p>
        ) : null}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="body">
          Message
        </label>
        <textarea
          id="body"
          required
          rows={5}
          maxLength={2000}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed"
          placeholder="e.g. The lift has been stuck on floor 3 since this morning"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {ok ? <p className="text-sm text-accent">{ok}</p> : null}

      <button
        type="submit"
        disabled={pending || !body.trim()}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
