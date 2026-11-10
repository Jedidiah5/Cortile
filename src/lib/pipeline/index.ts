/**
 * Pipeline entry point. Wired in Phases 3–5.
 * Seed --process and POST /api/messages call this.
 */
export async function processMessage(_messageId: string): Promise<void> {
  throw new Error(
    "Pipeline not implemented yet — complete Phases 3–4, then re-run seed with --process.",
  );
}
