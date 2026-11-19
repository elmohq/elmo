import { describe, expect, it } from "vitest";
import type { Fetched } from "../fetcher";
import { type CheckDefinition, count, list, notFetched, result, share, wasNotFetched } from "./result";

const definition: CheckDefinition = {
	id: "llms-txt",
	group: "read",
	title: "llms.txt",
	fix: "Add an llms.txt file.",
};

const url = "https://example.com/llms.txt";
const skipped: Fetched = { kind: "skipped", requestedUrl: url, reason: "budget" };
const failed: Fetched = { kind: "error", requestedUrl: url, message: "connection refused", blocked: false };

describe("share", () => {
	it("rounds to the nearest whole percent", () => {
		expect(share(1, 4)).toBe("25%");
		expect(share(1, 3)).toBe("33%");
		expect(share(2, 3)).toBe("67%");
		expect(share(3, 3)).toBe("100%");
		expect(share(0, 7)).toBe("0%");
	});

	it("returns 0% instead of dividing by zero", () => {
		expect(share(0, 0)).toBe("0%");
		expect(share(5, 0)).toBe("0%");
	});
});

describe("list", () => {
	it("joins one or two items without commas", () => {
		expect(list([])).toBe("");
		expect(list(["robots.txt"])).toBe("robots.txt");
		expect(list(["GPTBot", "ClaudeBot"])).toBe("GPTBot and ClaudeBot");
	});

	it("uses an Oxford comma for three or more items", () => {
		expect(list(["GPTBot", "ClaudeBot", "PerplexityBot"])).toBe("GPTBot, ClaudeBot, and PerplexityBot");
		expect(list(["a", "b", "c", "d"])).toBe("a, b, c, and d");
	});
});

describe("count", () => {
	it("picks the singular or plural noun", () => {
		expect(count(1, "page")).toBe("1 page");
		expect(count(0, "page")).toBe("0 pages");
		expect(count(2, "page")).toBe("2 pages");
	});

	it("adds a thousands separator", () => {
		expect(count(1234, "page")).toBe("1,234 pages");
	});

	it("uses a custom plural when one is given", () => {
		expect(count(1, "category", "categories")).toBe("1 category");
		expect(count(3, "category", "categories")).toBe("3 categories");
	});
});

describe("result", () => {
	it("omits the fix and pages when the check passed", () => {
		expect(result(definition, "pass", "Found.")).toEqual({
			id: "llms-txt",
			group: "read",
			title: "llms.txt",
			status: "pass",
			evidence: "Found.",
		});
	});

	it("includes the fix only for statuses that need one", () => {
		expect(result(definition, "fail", "Missing.").fix).toBe("Add an llms.txt file.");
		expect(result(definition, "warn", "Missing.").fix).toBe("Add an llms.txt file.");
		expect(result(definition, "info", "Missing.").fix).toBe("Add an llms.txt file.");
		expect(result(definition, "not_checked", "Skipped.")).not.toHaveProperty("fix");
	});

	it("includes pages only when there are some", () => {
		expect(result(definition, "fail", "Missing.", [url]).pages).toEqual([url]);
		expect(result(definition, "fail", "Missing.", [])).not.toHaveProperty("pages");
	});
});

describe("notFetched", () => {
	it("reports a skipped request as not checked, without a fix", () => {
		expect(notFetched(definition, skipped, "llms.txt")).toEqual({
			id: "llms-txt",
			group: "read",
			title: "llms.txt",
			status: "not_checked",
			evidence: "Couldn't check llms.txt: the request budget ran out.",
		});
	});

	it("explains each reason a request was skipped", () => {
		const evidence = (reason: "robots" | "crawl-delay" | "host-stopped") =>
			notFetched(definition, { kind: "skipped", requestedUrl: url, reason }, "llms.txt").evidence;

		expect(evidence("robots")).toBe("Couldn't check llms.txt: robots.txt disallows ElmoBot.");
		expect(evidence("crawl-delay")).toBe(
			"Couldn't check llms.txt: robots.txt asks for a Crawl-delay longer than the audit waits.",
		);
		expect(evidence("host-stopped")).toBe("Couldn't check llms.txt: the site stopped responding normally.");
	});

	it("passes on the error message of a failed request", () => {
		expect(notFetched(definition, failed, "llms.txt").evidence).toBe("Couldn't check llms.txt: connection refused.");
	});

	it("says the URL wasn't fetched when there's no result", () => {
		expect(notFetched(definition, undefined, "llms.txt").evidence).toBe("Couldn't check llms.txt: it was not fetched.");
	});
});

describe("wasNotFetched", () => {
	it("is true for a missing or skipped fetch and false for a failed one", () => {
		expect(wasNotFetched(undefined)).toBe(true);
		expect(wasNotFetched(skipped)).toBe(true);
		expect(wasNotFetched(failed)).toBe(false);
	});
});
