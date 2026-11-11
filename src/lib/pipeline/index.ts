/**
 * Pipeline entry point. Wired in Phases 3–5.
 * Seed --process and POST /api/messages call this.
 * Phase 2: no-op so messages still land in the inbox as status='new'.
 */
export async function processMessage(_messageId: string): Promise<void> {
  // Triage + grouping land in Phases 3–4.
}
