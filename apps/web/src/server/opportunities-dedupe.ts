/**
 * De-duplication for a generated Opportunities report.
 *
 * Kept out of `@/server/opportunities` so it carries no server-only imports:
 * that module builds the auth instance at import time, which needs the app's
 * runtime environment.
 */
import type { OpportunitiesReport } from "@/server/opportunities";

/** First occurrence of each entry, by whatever `key` identifies it. */
function distinctBy<T>(items: T[], key: (item: T) => string): T[] {
	const seen = new Set<string>();
	return items.filter((item) => {
		const id = key(item);
		if (seen.has(id)) return false;
		seen.add(id);
		return true;
	});
}

export const normalizeText = (text: string) => text.trim().toLowerCase();

export function withoutRepeats(report: OpportunitiesReport): OpportunitiesReport {
	return {
		...report,
		summary: distinctBy(report.summary, normalizeText),
		risks: distinctBy(report.risks, normalizeText),
		opportunities: distinctBy(report.opportunities, (o) => normalizeText(o.title)).map((o) => ({
			...o,
			relatedPrompts: distinctBy(o.relatedPrompts, (p) => normalizeText(p.text)),
			yourCitations: distinctBy(o.yourCitations, (c) => c.url),
			competitorCitations: distinctBy(o.competitorCitations, (c) => c.url),
		})),
	};
}
