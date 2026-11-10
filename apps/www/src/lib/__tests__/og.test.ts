import { describe, expect, it } from "vitest";
import { getMarketingOgImage, getPageImage } from "@/lib/og";

function ogUrl(url: string): URL {
	return new URL(url, "https://example.com");
}

function ogParams(url: string): URLSearchParams {
	return ogUrl(url).searchParams;
}

describe("getMarketingOgImage", () => {
	it("removes brand from the end of the title", () => {
		expect(ogParams(getMarketingOgImage({ title: "Pricing · Elmo" })).get("title")).toBe("Pricing");
		expect(ogParams(getMarketingOgImage({ title: "Blog | Elmo" })).get("title")).toBe("Blog");
		expect(ogParams(getMarketingOgImage({ title: "Pricing  ·  Elmo" })).get("title")).toBe("Pricing");
		expect(ogParams(getMarketingOgImage({ title: "Pricing · ELMO" })).get("title")).toBe("Pricing");
	});

	it("removes brand from the start of the title", () => {
		expect(ogParams(getMarketingOgImage({ title: "Elmo · Open Source AI Visibility" })).get("title")).toBe(
			"Open Source AI Visibility",
		);
		expect(ogParams(getMarketingOgImage({ title: "Elmo - Docs" })).get("title")).toBe("Docs");
		expect(ogParams(getMarketingOgImage({ title: "Elmo: Pricing" })).get("title")).toBe("Pricing");
		expect(ogParams(getMarketingOgImage({ title: "elmo · Pricing" })).get("title")).toBe("Pricing");
		expect(ogParams(getMarketingOgImage({ title: "Elmo·Pricing" })).get("title")).toBe("Pricing");
	});

	it("removes brand from both ends of the title", () => {
		expect(ogParams(getMarketingOgImage({ title: "Elmo · Pricing · Elmo" })).get("title")).toBe("Pricing");
	});

	it("leaves titles without separable brand prefix or suffix unchanged", () => {
		expect(ogParams(getMarketingOgImage({ title: "Pricing" })).get("title")).toBe("Pricing");
		expect(ogParams(getMarketingOgImage({ title: "Elmo" })).get("title")).toBe("Elmo");
		expect(ogParams(getMarketingOgImage({ title: "Elmo Cloud" })).get("title")).toBe("Elmo Cloud");
		expect(ogParams(getMarketingOgImage({ title: "Why Elmo · Elmo" })).get("title")).toBe("Why Elmo");
		expect(ogParams(getMarketingOgImage({ title: "Elmo · Why Elmo" })).get("title")).toBe("Why Elmo");
		expect(ogParams(getMarketingOgImage({ title: "Elmohq · Pricing" })).get("title")).toBe("Elmohq · Pricing");
		expect(ogParams(getMarketingOgImage({ title: "Pricing · Elmohq" })).get("title")).toBe("Pricing · Elmohq");
	});

	it("preserves special characters through the round trip", () => {
		expect(ogParams(getMarketingOgImage({ title: "A/B? #1 & more" })).get("title")).toBe("A/B? #1 & more");
	});

	it("uses /og.png pathname and passes description and label when non-empty", () => {
		const result = getMarketingOgImage({
			title: "Pricing",
			description: "Plans & pricing for teams",
			label: "Pricing",
		});
		const parsed = ogUrl(result);
		expect(parsed.pathname).toBe("/og.png");
		expect(parsed.searchParams.get("description")).toBe("Plans & pricing for teams");
		expect(parsed.searchParams.get("label")).toBe("Pricing");
	});

	it("omits description and label parameters when absent or empty", () => {
		const absent = ogParams(getMarketingOgImage({ title: "Pricing" }));
		expect(absent.has("description")).toBe(false);
		expect(absent.has("label")).toBe(false);

		const empty = ogParams(getMarketingOgImage({ title: "Pricing", description: "", label: "" }));
		expect(empty.has("description")).toBe(false);
		expect(empty.has("label")).toBe(false);
	});
});

describe("getPageImage", () => {
	it("returns image segments and url for empty slugs", () => {
		expect(getPageImage([])).toEqual({
			segments: ["image.png"],
			url: "/og/docs/image.png",
		});
	});

	it("returns image segments and url for nested slugs", () => {
		expect(getPageImage(["guides", "setup"])).toEqual({
			segments: ["guides", "setup", "image.png"],
			url: "/og/docs/guides/setup/image.png",
		});
	});

	it("does not mutate the input array", () => {
		const slugs = ["guides", "setup"];
		getPageImage(slugs);
		expect(slugs).toEqual(["guides", "setup"]);
	});
});
