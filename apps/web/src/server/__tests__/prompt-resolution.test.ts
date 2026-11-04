import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/lib/db/db", () => ({ db: {} }));

const { effectiveTags, matchesTagFilter } = await import("@/server/prompt-resolution");

const matches = (prompt: { systemTags: string[] | null; tags: string[] | null }, filter: string[]) =>
	matchesTagFilter(effectiveTags(prompt), filter);

describe("prompt tag filtering", () => {
	it("files a prompt under its detected branded status", () => {
		const prompt = { systemTags: ["branded"], tags: ["pricing"] };
		expect(matches(prompt, ["branded"])).toBe(true);
		expect(matches(prompt, ["unbranded"])).toBe(false);
		expect(matches(prompt, ["pricing"])).toBe(true);
	});

	it("lets a user tag override the detected branded status", () => {
		const prompt = { systemTags: ["branded"], tags: ["unbranded"] };
		expect(matches(prompt, ["unbranded"])).toBe(true);
		expect(matches(prompt, ["branded"])).toBe(false);
	});

	it("treats an untagged prompt as unbranded", () => {
		expect(effectiveTags({ systemTags: null, tags: null })).toEqual(["unbranded"]);
	});

	it("matches every prompt when no filter is set", () => {
		expect(matches({ systemTags: null, tags: null }, [])).toBe(true);
	});
});
