import { WEB_QUERIES_UNAVAILABLE } from "./constants";

/** Trim + lowercase, matching the read-side echo/sentinel comparisons. */
const norm = (s: string) => s.trim().toLowerCase();

/**
 * Enforce the `prompt_runs.web_queries` invariant at write time: no entry may
 * echo the prompt itself. Some provider/model combos return the prompt as
 * their "search query" (DataForSEO's Google AI Mode dataset stores
 * `[prompt]`; others could do the same), and an echo is not genuine fan-out.
 *
 * This must happen at write time because it's the only place the prompt text
 * AS RUN is reliably known — read-time comparisons against `prompts.value`
 * silently break once the prompt is edited, leaking old echoes back in as
 * real queries. The read-side filters in `genuineFanoutWq` remain only for
 * rows written before this guard existed.
 *
 * If stripping removes everything but a search demonstrably happened
 * (citations exist), the standard `"unavailable"` sentinel is written so
 * "searched but queries unexposed" stays distinguishable from "didn't search".
 */
export function stripPromptEcho(webQueries: string[], prompt: string, hasCitations: boolean): string[] {
	const kept = webQueries.filter((q) => norm(q) !== norm(prompt));
	if (kept.length === 0 && webQueries.length > 0 && hasCitations) return [WEB_QUERIES_UNAVAILABLE];
	return kept;
}
