import { describe, expect, it } from "vitest";
import type { Fetched } from "../fetcher";
import { type CheckDefinition, count, list, notFetched, result, share, wasNotFetched } from "./result";

const definition: CheckDefinition = {
	id: "llms-txt",
	group: "read",
	title: "llms.txt",
	fix: "Add an llms.txt file.",
};

function skipped(reason: "budget" | "robots" | "crawl-delay" | "host-stopped"): Fetched {
	return { kind: "skipped", requestedUrl: "https://example.com/llms.txt", reason };
}

const failed: Fetched = {
	kind: "error",
	requestedUrl: "https://example.com/llms.txt",
	message: "connection refused",
	blocked: false,
};

describe("share", () => {
	it("formats a fraction as a rounded whole percentage", () => {
		expect(share(1, 4)).toBe("25%");
		expect(share(1, 3)).toBe("33%");
		expect(share(2, 3)).toBe("67%");
		expect(share(3, 3)).toBe("100%");
	});

	it("returns 0% instead of dividing by zero", () => {
		expect(share(0, 7)).toBe("0%");
		expect(share(0, 0)).toBe("0%");
		expect(share(5, 0)).toBe("0%");
	});
});

describe("list", () => {
	it("returns an empty string for no items", () => {
		expect(list([])).toBe("");
	});

	it("joins one item on its own", () => {
		expect(list(["robots.txt"])).toBe("robots.txt");
	});

	it("joins two items with and", () => {
		expect(list(["GPTBot", "ClaudeBot"])).toBe("GPTBot and ClaudeBot");
	});

	it("uses an Oxford comma for three or more items", () => {
		expect(list(["GPTBot", "ClaudeBot", "PerplexityBot"])).toBe("GPTBot, ClaudeBot, and PerplexityBot");
		expect(list(["a", "b", "c", "d"])).toBe("a, b, c, and d");
	});
});

describe("count", () => {
	it("uses the singular for one and the plural otherwise", () => {
		expect(count(1, "page")).toBe("1 page");
		expect(count(0, "page")).toBe("0 pages");
		expect(count(2, "page")).toBe("2 pages");
	});

	it("adds thousands separators", () => {
		expect(count(1234, "page")).toBe("1,234 pages");
	});

	it("honors a custom plural", () => {
		expect(count(1, "category", "categories")).toBe("1 category");
		expect(count(3, "category", "categories")).toBe("3 categories");
	});
});

describe("result", () => {
	it("builds a pass result without fix or pages", () => {
		expect(result(definition, "pass", "Found.")).toEqual({
			id: "llms-txt",
			group: "read",
			title: "llms.txt",
			status: "pass",
			evidence: "Found.",
		});
	});

	it("includes fix for fail, warn and info", () => {
		for (const status of ["fail", "warn", "info"] as const) {
			expect(result(definition, status, "Missing.").fix).toBe("Add an llms.txt file.");
		}
	});

	it("omits fix for not_checked", () => {
		expect(result(definition, "not_checked", "Skipped.")).not.toHaveProperty("fix");
	});

	it("includes a non-empty pages list", () => {
		expect(result(definition, "fail", "Missing.", ["https://example.com/a"]).pages).toEqual(["https://example.com/a"]);
	});

	it("omits pages when the list is empty", () => {
		expect(result(definition, "fail", "Missing.", [])).not.toHaveProperty("pages");
	});
});

describe("notFetched", () => {
	it("explains each skip reason", () => {
		const cases: ["budget" | "robots" | "crawl-delay" | "host-stopped", string][] = [
			["budget", "the request budget ran out"],
			["robots", "robots.txt disallows ElmoBot"],
			["crawl-delay", "robots.txt asks for a Crawl-delay longer than the audit waits"],
			["host-stopped", "the site stopped responding normally"],
		];
		for (const [reason, explanation] of cases) {
			expect(notFetched(definition, skipped(reason), "llms.txt").evidence).toBe(
				`Couldn't check llms.txt: ${explanation}.`,
			);
		}
	});

	it("builds a not_checked result with no fix for a skip", () => {
		expect(notFetched(definition, skipped("budget"), "llms.txt")).toEqual({
			id: "llms-txt",
			group: "read",
			title: "llms.txt",
			status: "not_checked",
			evidence: "Couldn't check llms.txt: the request budget ran out.",
		});
	});

	it("reports the failure message for a failed fetch", () => {
		expect(notFetched(definition, failed, "llms.txt").evidence).toBe("Couldn't check llms.txt: connection refused.");
	});

	it("reports an absent fetch", () => {
		expect(notFetched(definition, undefined, "llms.txt").evidence).toBe("Couldn't check llms.txt: it was not fetched.");
	});
});

describe("wasNotFetched", () => {
	it("treats undefined as not fetched", () => {
		expect(wasNotFetched(undefined)).toBe(true);
	});

	it("treats a skipped fetch as not fetched", () => {
		expect(wasNotFetched(skipped("robots"))).toBe(true);
	});

	it("treats a failed fetch as fetched", () => {
		expect(wasNotFetched(failed)).toBe(false);
	});
});
