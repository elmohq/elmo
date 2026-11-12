import { describe, expect, it } from "vitest";
import { getMarketingOgImage, getPageImage } from "@/lib/og";

const ogUrl = (opts: Parameters<typeof getMarketingOgImage>[0]) =>
	new URL(getMarketingOgImage(opts), "http://localhost");

const titleOf = (title: string) => ogUrl({ title }).searchParams.get("title");

describe("getMarketingOgImage", () => {
	describe("title", () => {
		it.each([
			["Pricing · Elmo", "Pricing"],
			["Blog | Elmo", "Blog"],
			["Docs - Elmo", "Docs"],
			["Pricing: Elmo", "Pricing"],
			["Pricing  ·  Elmo", "Pricing"],
			["Pricing · ELMO", "Pricing"],
		])("removes the brand from the end of %j", (title, expected) => {
			expect(titleOf(title)).toBe(expected);
		});

		it.each([
			["Elmo · Open Source AI Visibility", "Open Source AI Visibility"],
			["Elmo | Blog", "Blog"],
			["Elmo - Docs", "Docs"],
			["Elmo: Pricing", "Pricing"],
			["elmo · Pricing", "Pricing"],
			["Elmo·Pricing", "Pricing"],
		])("removes the brand from the start of %j", (title, expected) => {
			expect(titleOf(title)).toBe(expected);
		});

		it("removes the brand from both ends", () => {
			expect(titleOf("Elmo · Pricing · Elmo")).toBe("Pricing");
		});

		it.each([
			["Pricing", "Pricing"],
			["Elmo", "Elmo"],
			["Elmo Cloud", "Elmo Cloud"],
			["Why Elmo · Elmo", "Why Elmo"],
			["Elmo · Why Elmo", "Why Elmo"],
			["Elmohq · Pricing", "Elmohq · Pricing"],
			["Pricing · Elmohq", "Pricing · Elmohq"],
			["Self-Host a Non-Elmo", "Self-Host a Non-Elmo"],
			["Elmo-Powered Search", "Elmo-Powered Search"],
		])("leaves %j as %j", (title, expected) => {
			expect(titleOf(title)).toBe(expected);
		});

		it("keeps special characters through the round trip", () => {
			expect(titleOf("A/B? #1 & more")).toBe("A/B? #1 & more");
		});
	});

	describe("URL", () => {
		it("always points at /og.png", () => {
			expect(ogUrl({ title: "Pricing" }).pathname).toBe("/og.png");
		});

		it("passes description and label through", () => {
			const url = ogUrl({ title: "Pricing", description: "Plans & pricing for teams", label: "Pricing" });
			expect(url.searchParams.get("description")).toBe("Plans & pricing for teams");
			expect(url.searchParams.get("label")).toBe("Pricing");
		});

		it.each([
			["missing", {}],
			["empty", { description: "", label: "" }],
		])("leaves out description and label when they are %s", (_, extra) => {
			const url = ogUrl({ title: "Pricing", ...extra });
			expect(url.searchParams.has("description")).toBe(false);
			expect(url.searchParams.has("label")).toBe(false);
		});
	});
});

describe("getPageImage", () => {
	it.each([
		[[], "/og/docs/image.png"],
		[["guides", "setup"], "/og/docs/guides/setup/image.png"],
	])("builds the docs image URL for %j", (slugs, expected) => {
		expect(getPageImage(slugs).url).toBe(expected);
	});
});
