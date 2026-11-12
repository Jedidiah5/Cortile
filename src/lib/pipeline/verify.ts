import type { Draft } from "@/lib/ai/schemas";

export type ChunkForVerify = {
  id: string;
  title: string;
  section: string;
  text: string;
};

export type StoredCitation = {
  chunk_id: string;
  quote: string;
  title: string;
  section: string;
};

function normalise(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Keep citations whose quote appears verbatim (case/whitespace-insensitive) in the chunk. */
export function verifyCitations(
  draft: Draft,
  chunks: ChunkForVerify[],
): { draft: Draft; citations: StoredCitation[] } {
  const byId = new Map(chunks.map((c) => [c.id, c]));
  const valid: StoredCitation[] = [];

  for (const cite of draft.citations) {
    const chunk = byId.get(cite.chunk_id);
    if (!chunk) continue;
    if (!normalise(chunk.text).includes(normalise(cite.quote))) continue;
    valid.push({
      chunk_id: cite.chunk_id,
      quote: cite.quote,
      title: chunk.title,
      section: chunk.section,
    });
  }

  return {
    draft: { ...draft, citations: valid.map(({ chunk_id, quote }) => ({ chunk_id, quote })) },
    citations: valid,
  };
}
