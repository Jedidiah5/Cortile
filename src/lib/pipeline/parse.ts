import type { z } from "zod";

/** Extract a JSON object from model text (strips optional ``` fences). */
export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const raw = fence ? fence[1].trim() : trimmed;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object in model response");
  }
  return JSON.parse(raw.slice(start, end + 1)) as unknown;
}

/**
 * Parse model JSON with Zod. On failure: retry once via `retry()`, then null.
 */
export async function parseWithRetry<T>(
  schema: z.ZodType<T>,
  firstText: string,
  retry: () => Promise<string>,
): Promise<{ data: T; raw: string; retried: boolean } | null> {
  const tryParse = (raw: string): T | null => {
    try {
      const json = extractJsonObject(raw);
      const result = schema.safeParse(json);
      return result.success ? result.data : null;
    } catch {
      return null;
    }
  };

  const first = tryParse(firstText);
  if (first) return { data: first, raw: firstText, retried: false };

  const secondText = await retry();
  const second = tryParse(secondText);
  if (second) return { data: second, raw: secondText, retried: true };

  return null;
}
