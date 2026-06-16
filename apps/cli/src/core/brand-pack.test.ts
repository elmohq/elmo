import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { OnboardingSuggestion } from "@workspace/lib/onboarding";
import { describe, expect, it } from "vitest";
import { readBrandPack, suggestionToBrandPack, toMentionBrand, toReportCompetitors } from "./brand-pack";

const suggestion: OnboardingSuggestion = {
	brandName: "Nike",
	website: "nike.com",
	additionalDomains: ["nike.co.uk"],
	aliases: ["Nike Inc"],
	competitors: [{ name: "Adidas", domains: ["adidas.com", "adidas.de"], aliases: [] }],
	suggestedPrompts: [
		{ prompt: "best running shoes", tags: ["footwear"] },
		{ prompt: "nike alternative", tags: ["brand"] },
	],
};

describe("suggestionToBrandPack", () => {
	it("maps suggestedPrompts to prompts", () => {
		const pack = suggestionToBrandPack(suggestion);
		expect(pack.prompts).toHaveLength(2);
		expect(pack.prompts[0].prompt).toBe("best running shoes");
		expect(pack.competitors[0].name).toBe("Adidas");
	});
});

describe("toReportCompetitors", () => {
	it("uses the first domain", () => {
		expect(toReportCompetitors(suggestion.competitors)).toEqual([{ name: "Adidas", domain: "adidas.com" }]);
	});
});

describe("toMentionBrand", () => {
	it("maps brand pack fields to the mention shape", () => {
		const pack = suggestionToBrandPack(suggestion);
		expect(toMentionBrand(pack)).toEqual({
			name: "Nike",
			website: "nike.com",
			aliases: ["Nike Inc"],
			additionalDomains: ["nike.co.uk"],
		});
	});
});

describe("readBrandPack", () => {
	it("round-trips a written pack and tolerates suggestedPrompts", async () => {
		const dir = await fs.mkdtemp(path.join(os.tmpdir(), "elmo-pack-"));
		const file = path.join(dir, "brand.json");
		await fs.writeFile(file, JSON.stringify(suggestion), "utf8");
		const pack = await readBrandPack(file);
		expect(pack.brandName).toBe("Nike");
		// `suggestedPrompts` (onboarding shape) is read as `prompts`.
		expect(pack.prompts.map((p) => p.prompt)).toEqual(["best running shoes", "nike alternative"]);
		await fs.rm(dir, { recursive: true, force: true });
	});

	it("throws when neither brandName nor website is present", async () => {
		const dir = await fs.mkdtemp(path.join(os.tmpdir(), "elmo-pack-"));
		const file = path.join(dir, "bad.json");
		await fs.writeFile(file, JSON.stringify({ prompts: [] }), "utf8");
		await expect(readBrandPack(file)).rejects.toThrow(/missing both brandName and website/);
		await fs.rm(dir, { recursive: true, force: true });
	});
});
