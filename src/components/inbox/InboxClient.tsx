"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Building, InboxData, InboxIncident, InboxMessage } from "@/lib/data/inbox";
import { CategoryChip, StatusChip, UrgencyChip } from "@/components/ui/Chips";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { EmergencyBanner } from "@/components/inbox/EmergencyBanner";
import { SuggestReply } from "@/components/inbox/SuggestReply";
import { EmptyState } from "@/components/ui/EmptyState";
import { useInboxRealtime } from "@/hooks/useInboxRealtime";

type Selection =
  | { kind: "incident"; id: string }
  | { kind: "message"; id: string }
  | null;

function defaultSelection(d: InboxData | undefined): Selection {
  if (!d) return null;
  if (d.incidents[0]) return { kind: "incident", id: d.incidents[0].id };
  if (d.conversations[0]) return { kind: "message", id: d.conversations[0].id };
  return null;
}

export function InboxClient({
  buildings,
  initialSlug,
  dataBySlug,
}: {
  buildings: Building[];
  initialSlug: string;
  dataBySlug: Record<string, InboxData>;
}) {
  const [slug, setSlug] = useState(initialSlug);
  const data = dataBySlug[slug];
  const [selection, setSelection] = useState<Selection>(() =>
    defaultSelection(dataBySlug[initialSlug]),
  );

  useInboxRealtime(data?.building.id);

  // When a selected message is absorbed into an incident (realtime), show that incident.
  const effectiveSelection = useMemo((): Selection => {
    if (!data) return selection;

    if (selection?.kind === "message") {
      const stillThere = data.conversations.some((m) => m.id === selection.id);
      if (stillThere) return selection;
      const host = data.incidents.find((i) =>
        i.messages.some((m) => m.id === selection.id),
      );
      if (host) return { kind: "incident", id: host.id };
      return defaultSelection(data);
    }

    if (selection?.kind === "incident") {
      if (data.incidents.some((i) => i.id === selection.id)) return selection;
      return defaultSelection(data);
    }

    return defaultSelection(data);
  }, [data, selection]);

  const selectedIncident: InboxIncident | null = useMemo(() => {
    if (!data || effectiveSelection?.kind !== "incident") return null;
    return data.incidents.find((i) => i.id === effectiveSelection.id) ?? null;
  }, [data, effectiveSelection]);

  const selectedMessage: InboxMessage | null = useMemo(() => {
    if (!data || effectiveSelection?.kind !== "message") return null;
    return data.conversations.find((m) => m.id === effectiveSelection.id) ?? null;
  }, [data, effectiveSelection]);

  function switchBuilding(next: string) {
    setSlug(next);
    setSelection(defaultSelection(dataBySlug[next]));
  }

  if (!data) {
    return <p className="p-8 text-muted">Building not found.</p>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <EmergencyBanner
        emergencies={data.emergencies}
        onCallNumber={data.onCallNumber}
      />

      <div className="border-b border-border bg-surface px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{data.building.name}</h1>
            <p className="text-sm text-muted">Manager inbox · {data.building.manager_name}</p>
          </div>
          <div className="flex border border-border bg-background p-0.5">
            {buildings.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => switchBuilding(b.slug)}
                className={`px-3 py-1.5 text-sm transition-colors ${
                  b.slug === slug
                    ? "bg-surface font-medium text-foreground shadow-sm"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {b.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto flex min-h-0 w-full max-w-[1400px] flex-1">
        <aside className="flex w-full max-w-md flex-col border-r border-border bg-surface">
          <div className="border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted">
            Incidents
          </div>
          <div className="overflow-y-auto">
            {data.incidents.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  title="No open incidents"
                  body="Related reports in the same building will group here."
                />
              </div>
            ) : (
              data.incidents.map((inc) => {
                const active =
                  effectiveSelection?.kind === "incident" &&
                  effectiveSelection.id === inc.id;
                return (
                  <button
                    key={inc.id}
                    type="button"
                    onClick={() => setSelection({ kind: "incident", id: inc.id })}
                    className={`block w-full border-b border-border px-4 py-3 text-left transition-colors ${
                      active ? "bg-accent-soft/70" : "hover:bg-panel"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium leading-snug">{inc.title}</p>
                      <StatusChip status={inc.status} />
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {inc.report_count === 1
                        ? "1 report"
                        : `${inc.report_count} reports`}{" "}
                      · <RelativeTime iso={inc.first_report_at} />
                    </p>
                  </button>
                );
              })
            )}
          </div>

          <div className="border-b border-t border-border px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted">
            Conversations
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {data.conversations.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  title="No conversations"
                  body="Send a message from Send as resident to try the pipeline."
                />
              </div>
            ) : (
              data.conversations.map((m) => {
                const active =
                  effectiveSelection?.kind === "message" &&
                  effectiveSelection.id === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelection({ kind: "message", id: m.id })}
                    className={`block w-full border-b border-border px-4 py-3 text-left transition-colors ${
                      active ? "bg-accent-soft/70" : "hover:bg-panel"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">
                        {m.resident.name}
                        <span className="font-normal text-muted"> · Flat {m.flat ?? "?"}</span>
                      </p>
                      <span className="shrink-0 text-xs text-muted">
                        <RelativeTime iso={m.created_at} />
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-sm text-ink-2">
                      {m.summary ?? m.body}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <CategoryChip category={m.category} />
                      <UrgencyChip urgency={m.urgency} />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section className="min-w-0 flex-1 overflow-y-auto bg-background p-4 sm:p-6">
          {selectedIncident ? (
            <IncidentDetail incident={selectedIncident} />
          ) : selectedMessage ? (
            <MessageDetail message={selectedMessage} />
          ) : (
            <EmptyState
              title="Nothing selected"
              body="Pick an incident or conversation from the list."
            />
          )}
        </section>
      </div>
    </div>
  );
}

function MessageDetail({ message }: { message: InboxMessage }) {
  return (
    <article className="mx-auto max-w-2xl">
      <header className="mb-4">
        <p className="text-sm text-muted">
          {message.resident.name} · Flat {message.flat ?? "?"} ·{" "}
          <RelativeTime iso={message.created_at} />
        </p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight">
          {message.summary ?? "Message"}
        </h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <CategoryChip category={message.category} />
          <UrgencyChip urgency={message.urgency} />
          {message.is_question ? (
            <span className="bg-[#eef3ee] px-1.5 py-0.5 text-[11px] font-medium text-[#4f6a4c]">
              question
            </span>
          ) : null}
        </div>
      </header>
      <div className="border border-border bg-surface p-4 text-[15px] leading-relaxed text-ink">
        {message.body}
      </div>
      {message.is_question ? <SuggestReply messageId={message.id} /> : null}
    </article>
  );
}

function IncidentDetail({ incident }: { incident: InboxIncident }) {
  return (
    <article className="mx-auto max-w-2xl">
      <header className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status={incident.status} />
          <CategoryChip category={incident.category} />
        </div>
        <h2 className="mt-2 text-xl font-semibold tracking-tight">{incident.title}</h2>
        <p className="mt-1 text-sm text-muted">
          {incident.report_count === 1
            ? "1 report"
            : `${incident.report_count} reports`}{" "}
          · first <RelativeTime iso={incident.first_report_at} />
        </p>
        <Link
          href={`/incidents/${incident.id}`}
          className="mt-3 inline-block text-sm font-medium text-accent hover:underline"
        >
          Open incident →
        </Link>
      </header>
      <ul className="space-y-3">
        {incident.messages.map((m) => (
          <li
            key={m.id}
            className="rounded-xl border border-border bg-surface p-4"
          >
            <p className="text-sm text-muted">
              {m.resident.name} · Flat {m.flat ?? "?"} ·{" "}
              <RelativeTime iso={m.created_at} />
            </p>
            <p className="mt-1 text-[15px] leading-relaxed text-ink">{m.body}</p>
          </li>
        ))}
      </ul>
    </article>
  );
}
