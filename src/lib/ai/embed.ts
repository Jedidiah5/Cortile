const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";

/**
 * Embed texts with Voyage AI. Single swap-point for the embedding provider.
 * Returns one 1024-dim vector per input (voyage-3.5-lite).
 */
export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error("Missing VOYAGE_API_KEY");

  const model = process.env.VOYAGE_MODEL ?? "voyage-3.5-lite";

  const res = await fetch(VOYAGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: texts,
      model,
      input_type: "document",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Voyage embed failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    data: { embedding: number[]; index: number }[];
  };

  return data.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}
