import { z } from "zod";

export const CATEGORIES = [
  "lift",
  "leak",
  "heating",
  "noise",
  "bins",
  "security",
  "door_entry",
  "parcels",
  "parking",
  "service_charge",
  "building_rules",
  "other",
] as const;

export const URGENCIES = ["emergency", "high", "normal", "low"] as const;
export type Urgency = (typeof URGENCIES)[number];

export const TriageSchema = z.object({
  category: z.enum(CATEGORIES),
  urgency: z.enum(URGENCIES),
  flat: z.string().nullable(),
  summary: z.string().min(3).max(140),
  is_question: z.boolean(),
});
export type Triage = z.infer<typeof TriageSchema>;

export const SameProblemSchema = z.object({
  same_problem: z.boolean(),
  reason: z.string().max(200),
});

export const IncidentTitleSchema = z.object({
  title: z.string().min(5).max(80),
});

export const CitationSchema = z.object({
  chunk_id: z.string().uuid(),
  quote: z.string().min(5).max(300),
});

export const DraftSchema = z.object({
  can_answer: z.boolean(),
  text: z.string().max(900),
  citations: z.array(CitationSchema),
  unanswered_topic: z.string().max(60).nullable(),
});
export type Draft = z.infer<typeof DraftSchema>;

/**
 * Checked in code BEFORE any AI call. A match forces urgency = "emergency".
 * The model may raise urgency, never lower it.
 */
export const EMERGENCY_PATTERNS: RegExp[] = [
  /water\s+(is\s+)?(pouring|coming|leaking|dripping)\s+(through|from)\s+(my\s+|the\s+)?ceiling/i,
  /\bflood(ing|ed)?\b/i,
  /\bburst\s+(water\s+)?pipe\b|\bpipe\s+(has\s+)?burst\b/i,
  /\bwater\s+everywhere\b/i,
  /\bfire\b/i,
  /\bsmoke\b/i,
  /\bsmell(s|ing)?\s+(of\s+)?gas\b|\bgas\s+leak\b/i,
  /\bsparks?\b|\belectrical\s+burning\b/i,
  /\bstuck\s+in\s+(the\s+)?lift\b|\btrapped\b/i,
];

const RANK: Record<Urgency, number> = { emergency: 3, high: 2, normal: 1, low: 0 };
export const maxUrgency = (a: Urgency, b: Urgency): Urgency => (RANK[a] >= RANK[b] ? a : b);

export const isEmergencyText = (text: string) => EMERGENCY_PATTERNS.some((p) => p.test(text));
