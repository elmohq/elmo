import { describe, expect, it } from "vitest";
import { pad, parseFormat, serialize, slugify, toCsv, toJsonl } from "./output";

describe("toCsv", () => {
	it("renders a header and rows", () => {
		const csv = toCsv([{ a: 1, b: "x" }], ["a", "b"]);
		expect(csv).toBe("a,b\n1,x");
	});

	it("escapes commas, quotes, and newlines", () => {
		const csv = toCsv([{ v: 'a,"b"\nc' }], ["v"]);
		expect(csv).toBe('v\n"a,""b""\nc"');
	});

	it("joins arrays with '; '", () => {
		const csv = toCsv([{ tags: ["a", "b"] }], ["tags"]);
		expect(csv).toBe("tags\na; b");
	});

	it("renders missing columns as empty", () => {
		expect(toCsv([{ a: 1 }], ["a", "b"])).toBe("a,b\n1,");
	});
});

describe("toJsonl", () => {
	it("writes one JSON object per line", () => {
		expect(toJsonl([{ a: 1 }, { b: 2 }])).toBe('{"a":1}\n{"b":2}');
	});
});

describe("serialize", () => {
	it("dispatches on format", () => {
		const rows = [{ a: 1 }];
		expect(serialize(rows, ["a"], "csv")).toBe("a\n1");
		expect(serialize(rows, ["a"], "jsonl")).toBe('{"a":1}');
	});
});

describe("parseFormat", () => {
	it("defaults to csv and accepts jsonl", () => {
		expect(parseFormat(undefined)).toBe("csv");
		expect(parseFormat("jsonl")).toBe("jsonl");
		expect(parseFormat("CSV")).toBe("csv");
	});
	it("rejects unknown formats", () => {
		expect(() => parseFormat("yaml")).toThrow(/Unknown --format/);
	});
});

describe("slugify", () => {
	it("produces filesystem-safe slugs", () => {
		expect(slugify("Best Running Shoes!")).toBe("best-running-shoes");
		expect(slugify("   ")).toBe("prompt");
	});
	it("caps length without a trailing dash", () => {
		expect(slugify("a".repeat(80), 10)).toBe("aaaaaaaaaa");
	});
});

describe("pad", () => {
	it("zero-pads to width 3", () => {
		expect(pad(1)).toBe("001");
		expect(pad(42)).toBe("042");
	});
});
