import { describe, expect, it } from "vitest";
import { getAlternatives, getCompetitorBySlug } from "@/lib/competitors";

describe("getAlternatives", () => {
	it("lists RankSpot last among the Sight AI alternatives", () => {
		const sightAi = getCompetitorBySlug("sight-ai");
		if (!sightAi) throw new Error("sight-ai missing");
		const alternatives = getAlternatives(sightAi);
		expect(alternatives).toHaveLength(6);
		expect(alternatives.at(-1)?.slug).toBe("rankspot");
	});

	it("never lists a tool as its own alternative", () => {
		const rankSpot = getCompetitorBySlug("rankspot");
		if (!rankSpot) throw new Error("rankspot missing");
		expect(getAlternatives(rankSpot).map((c) => c.slug)).not.toContain("rankspot");
	});
});
