import { isEmergencyText, type Urgency } from "@/lib/ai/schemas";

/**
 * Keyword emergency check — runs in code BEFORE any AI call.
 * A match forces urgency = "emergency"; the model may only raise, never lower.
 */
export function checkEmergency(body: string): {
  isEmergency: boolean;
  floorUrgency: Urgency;
} {
  const isEmergency = isEmergencyText(body);
  return {
    isEmergency,
    floorUrgency: isEmergency ? "emergency" : "low",
  };
}
