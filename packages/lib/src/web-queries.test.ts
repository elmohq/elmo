import { describe, it, expect } from "vitest";
import { stripPromptEcho } from "./web-queries";
import { WEB_QUERIES_UNAVAILABLE } from "./constants";

describe("stripPromptEcho", () => {
	const prompt = "What is the best CRM for startups?";

	it("strips entries that echo the prompt, keeping genuine queries", () => {
		expect(stripPromptEcho(["best crm 2026", prompt, "crm pricing"], prompt, true)).toEqual([
			"best crm 2026",
			"crm pricing",
		]);
	});

	it("matches echoes case- and whitespace-insensitively", () => {
		expect(stripPromptEcho(["  what is the BEST crm for startups?  ", "crm reviews"], prompt, true)).toEqual([
			"crm reviews",
		]);
	});

	it("substitutes the unavailable sentinel when everything was an echo and a search happened", () => {
		// An echo-only result with citations means the engine searched but the
		// provider exposed no real query strings (DataForSEO-style).
		expect(stripPromptEcho([prompt], prompt, true)).toEqual([WEB_QUERIES_UNAVAILABLE]);
	});

	it("returns empty when everything was an echo and no search is evidenced", () => {
		expect(stripPromptEcho([prompt], prompt, false)).toEqual([]);
	});

	it("leaves empty input empty regardless of citations", () => {
		expect(stripPromptEcho([], prompt, true)).toEqual([]);
		expect(stripPromptEcho([], prompt, false)).toEqual([]);
	});

	it("passes the existing sentinel through untouched", () => {
		expect(stripPromptEcho([WEB_QUERIES_UNAVAILABLE], prompt, true)).toEqual([WEB_QUERIES_UNAVAILABLE]);
	});
});
