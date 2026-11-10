import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");
  client = new Anthropic({ apiKey });
  return client;
}

export function fastModel(): string {
  return process.env.CLAUDE_FAST_MODEL ?? "claude-haiku-4-5-20251001";
}

export function draftModel(): string {
  return process.env.CLAUDE_DRAFT_MODEL ?? "claude-sonnet-5";
}

/**
 * Call Claude and return the raw text content of the first text block.
 * Caller is responsible for Zod parsing / retry.
 */
export async function claudeJson(
  model: string,
  system: string,
  user: string,
): Promise<string> {
  const anthropic = getAnthropic();
  const response = await anthropic.messages.create({
    model,
    max_tokens: 1024,
    system,
    messages: [{ role: "user", content: user }],
  });

  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("Claude returned no text content");
  }
  return block.text.trim();
}
