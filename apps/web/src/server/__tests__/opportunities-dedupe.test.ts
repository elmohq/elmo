import { describe, expect, it } from "vitest";
import type { OpportunitiesReport } from "@/server/opportunities";
import { withoutRepeats } from "@/server/opportunities-dedupe";

function opportunity(title: string, overrides: Partial<OpportunitiesReport["opportunities"][number]> = {}) {
	return {
		category: "creation" as const,
		title,
		why: "because",
		relatedPrompts: [],
		yourCitations: [],
		competitorCitations: [],
		...overrides,
	};
}

function report(overrides: Partial<OpportunitiesReport> = {}): OpportunitiesReport {
	return { summary: [], risks: [], opportunities: [], ...overrides };
}

/**
 * Every list the report renders is keyed by its own content, so two entries
 * that read the same would collide. Nothing constrains the model from
 * repeating itself, and stored reports predate this being enforced.
 */
describe("withoutRepeats", () => {
	it("keeps the first of two identical summary bullets", () => {
		const result = withoutRepeats(report({ summary: ["Competitors out-cite you", "Competitors out-cite you"] }));
		expect(result.summary).toEqual(["Competitors out-cite you"]);
	});

	it("treats entries differing only in case or padding as the same", () => {
		const result = withoutRepeats(report({ risks: ["Hard to win", "  hard to win  "] }));
		expect(result.risks).toEqual(["Hard to win"]);
	});

	it("keeps the first of two opportunities with the same title", () => {
		const result = withoutRepeats(
			report({ opportunities: [opportunity("Get into the roundup"), opportunity("get into the roundup")] }),
		);
		expect(result.opportunities.map((o) => o.title)).toEqual(["Get into the roundup"]);
	});

	it("de-duplicates a repeated prompt and citation within an opportunity", () => {
		const page = { title: "T", domain: "d.com", url: "https://d.com/a" };
		const result = withoutRepeats(
			report({
				opportunities: [
					opportunity("One", {
						relatedPrompts: [
							{ text: "best crm", promptId: "p1" },
							{ text: "best crm", promptId: "p1" },
						],
						yourCitations: [page, page],
						competitorCitations: [page, page],
					}),
				],
			}),
		);
		const [only] = result.opportunities;
		expect(only.relatedPrompts).toHaveLength(1);
		expect(only.yourCitations).toHaveLength(1);
		expect(only.competitorCitations).toHaveLength(1);
	});

	it("leaves entries that genuinely differ alone", () => {
		const result = withoutRepeats(report({ summary: ["a", "b", "c"] }));
		expect(result.summary).toEqual(["a", "b", "c"]);
	});
});
