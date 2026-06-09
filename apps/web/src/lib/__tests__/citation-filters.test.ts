import { describe, expect, it } from "vitest";
import { hasTagFilter, type PromptForFilter, resolveEnabledPromptIds } from "../citation-filters";

const prompts: PromptForFilter[] = [
	{ id: "p1", systemTags: ["branded"], tags: [] }, // branded
	{ id: "p2", systemTags: [], tags: ["pricing"] }, // unbranded + user tag
	{ id: "p3", systemTags: ["branded"], tags: ["unbranded"] }, // user override → unbranded
	{ id: "p4", systemTags: [], tags: [] }, // unbranded, untagged
];

describe("resolveEnabledPromptIds", () => {
	it("returns every prompt when there is no tag filter", () => {
		expect(resolveEnabledPromptIds(prompts, undefined)).toEqual(["p1", "p2", "p3", "p4"]);
		expect(resolveEnabledPromptIds(prompts, "")).toEqual(["p1", "p2", "p3", "p4"]);
	});

	it("filters by the branded system tag, respecting user overrides", () => {
		expect(resolveEnabledPromptIds(prompts, "branded")).toEqual(["p1"]);
	});

	it("filters by the unbranded system tag", () => {
		expect(resolveEnabledPromptIds(prompts, "unbranded")).toEqual(["p2", "p3", "p4"]);
	});

	it("filters by a user tag", () => {
		expect(resolveEnabledPromptIds(prompts, "pricing")).toEqual(["p2"]);
	});

	it("unions branded and user-tag filters", () => {
		expect(resolveEnabledPromptIds(prompts, "branded,pricing")).toEqual(["p1", "p2"]);
	});

	it("returns no prompts when a tag matches nothing", () => {
		expect(resolveEnabledPromptIds(prompts, "nonexistent")).toEqual([]);
	});
});

describe("hasTagFilter", () => {
	it("detects whether any tags are selected", () => {
		expect(hasTagFilter(undefined)).toBe(false);
		expect(hasTagFilter("")).toBe(false);
		expect(hasTagFilter(",")).toBe(false);
		expect(hasTagFilter("branded")).toBe(true);
	});
});
