import { describe, expect, it } from "vitest";
import { API_PROVIDER_IDS } from "@/lib/analytics-sql";
import { citationsByBareModel, isGroundedCitationRow } from "@/server/analytics-core";

describe("isGroundedCitationRow", () => {
	it("is grounded only when web search is on and the provider reaches the model directly", () => {
		expect(API_PROVIDER_IDS.length).toBeGreaterThan(0);
		const apiProvider = API_PROVIDER_IDS[0];

		expect(isGroundedCitationRow({ provider: apiProvider, web_search_enabled: true })).toBe(true);
		expect(isGroundedCitationRow({ provider: "brightdata", web_search_enabled: true })).toBe(false);
		expect(isGroundedCitationRow({ provider: apiProvider, web_search_enabled: false })).toBe(false);
		expect(isGroundedCitationRow({ provider: "", web_search_enabled: false })).toBe(false);
	});
});

describe("citationsByBareModel", () => {
	const apiProvider = API_PROVIDER_IDS[0];
	const rows = [
		{ model: "chatgpt", provider: "", web_search_enabled: false, count: 10 },
		{ model: "chatgpt", provider: apiProvider, web_search_enabled: true, count: 4 },
		{ model: "claude", provider: "", web_search_enabled: false, count: 7 },
	];

	it("sums every row for a model when no target is active, regardless of grounded status", () => {
		const byModel = citationsByBareModel(rows, null);
		expect(byModel.get("chatgpt")).toBe(14);
		expect(byModel.get("claude")).toBe(7);
	});

	it("keeps only the grounded rows for a premium target", () => {
		const byModel = citationsByBareModel(rows, { model: "chatgpt", premium: true });
		expect(byModel.get("chatgpt")).toBe(4);
		expect(byModel.has("claude")).toBe(false);
	});

	it("keeps only the standard rows for a non-premium target", () => {
		const byModel = citationsByBareModel(rows, { model: "chatgpt", premium: false });
		expect(byModel.get("chatgpt")).toBe(10);
		expect(byModel.get("claude")).toBe(7);
	});
});
