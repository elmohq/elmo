import type { OpportunityTier } from "@/lib/visibility-stats";

/**
 * Tier → dot/badge colour, shared by the opportunity map and the
 * opportunity-vs-difficulty chart. Kept out of the chart components so those
 * files export only components (otherwise React Fast Refresh can't hot-reload
 * them — a mixed component + constant export is "incompatible").
 */
export const TIER_COLOR: Record<OpportunityTier, string> = {
	won: "#3b82f6",
	high: "#10b981",
	medium: "#f59e0b",
	low: "#94a3b8",
	none: "#cbd5e1",
};
