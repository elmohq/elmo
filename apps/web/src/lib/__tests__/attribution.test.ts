import { describe, expect, it } from "vitest";
import { attributionParams } from "@/lib/attribution";

describe("attributionParams", () => {
	it("keeps ref, UTM tags, and ad click IDs", () => {
		expect(
			attributionParams({
				ref: "marketing-demo-frame",
				utm_source: "newsletter",
				utm_campaign: "launch",
				gclid: "abc123",
			}),
		).toEqual({ ref: "marketing-demo-frame", utm_source: "newsletter", utm_campaign: "launch", gclid: "abc123" });
	});

	it("drops the page's own parameters", () => {
		expect(attributionParams({ returnTo: "/app", sig: "signed", range: "30d", ref: "cli" })).toEqual({ ref: "cli" });
	});

	it("keeps values the router parsed as numbers", () => {
		expect(attributionParams({ utm_term: 2026 })).toEqual({ utm_term: 2026 });
	});

	it("ignores values that aren't plain text", () => {
		expect(attributionParams({ ref: { nested: true }, utm_source: ["a", "b"] })).toEqual({});
	});
});
