const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Embed texts with Voyage AI. Single swap-point for the embedding provider.
 * Returns one 1024-dim vector per input (voyage-3.5-lite).
 * Retries on 429 (free tier is ~3 RPM without a payment method).
 */
export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error("Missing VOYAGE_API_KEY");

  const model = process.env.VOYAGE_MODEL ?? "voyage-3.5-lite";
  const maxAttempts = 6;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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

    if (res.ok) {
      const data = (await res.json()) as {
        data: { embedding: number[]; index: number }[];
      };
      return data.data
        .sort((a, b) => a.index - b.index)
        .map((d) => d.embedding);
    }

    const body = await res.text();
    if (res.status === 429 && attempt < maxAttempts) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.min(60_000, 21_000 * attempt); // ~3 RPM → wait ~21s+
      console.warn(
        `  Voyage rate-limited (429), retry ${attempt}/${maxAttempts - 1} in ${Math.round(waitMs / 1000)}s…`,
      );
      await sleep(waitMs);
      continue;
    }

    throw new Error(`Voyage embed failed (${res.status}): ${body}`);
  }

  throw new Error("Voyage embed failed after retries");
}
