import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	pad,
	parseFormat,
	printCsv,
	serialize,
	slugify,
	toCsv,
	toJsonl,
	writeJson,
	writeStructured,
	writeText,
} from "./output";

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

	it("neutralizes formula injection in text cells but not numbers", () => {
		// prefixed with ' (no other special chars → not quoted)
		expect(toCsv([{ q: "=danger" }], ["q"])).toBe("q\n'=danger");
		expect(toCsv([{ q: "+1-800-CALL" }], ["q"])).toBe("q\n'+1-800-CALL");
		// prefixed AND quoted when it also contains a comma
		expect(toCsv([{ q: "=A1,B2" }], ["q"])).toBe(`q\n"'=A1,B2"`);
		// negative numbers are emitted verbatim
		expect(toCsv([{ n: -5 }], ["n"])).toBe("n\n-5");
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

describe("printCsv", () => {
	const ESC = "\u001b";
	const prompt = `best crm${ESC}]52;c;ZXZpbA==\u0007 for startups`;
	const isTTY = process.stdout.isTTY;

	afterEach(() => {
		process.stdout.isTTY = isTTY;
		vi.restoreAllMocks();
	});

	function printed(terminal: boolean): string {
		process.stdout.isTTY = terminal;
		const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
		printCsv([{ prompt }], ["prompt"]);
		return String(write.mock.calls[0]?.[0]);
	}

	it("drops terminal control sequences from untrusted text shown in a terminal", () => {
		expect(printed(true)).toBe("prompt\nbest crm]52;c;ZXZpbA== for startups\n");
	});

	it("leaves piped output byte for byte", () => {
		expect(printed(false)).toBe(`prompt\n${prompt}\n`);
	});
});

describe("writing artifacts", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	async function checkoutWithOutsideFile() {
		const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "elmo-output-")));
		const checkout = path.join(root, "checkout");
		const outside = path.join(root, "outside");
		await fs.mkdir(checkout);
		await fs.mkdir(outside);
		await fs.writeFile(path.join(outside, "config"), "keep me");
		vi.spyOn(process, "cwd").mockReturnValue(checkout);
		return { checkout, outside };
	}

	it("replaces an artifact planted as a symlink instead of writing through it", async () => {
		const { checkout, outside } = await checkoutWithOutsideFile();
		await fs.symlink(path.join(outside, "config"), path.join(checkout, "plan.md"));
		await fs.symlink(path.join(outside, "config"), path.join(checkout, "competitors.csv"));

		await writeText(checkout, "plan.md", "# Plan");
		await writeStructured(checkout, "competitors", [{ name: "Acme" }], ["name"], "csv");

		expect(await fs.readFile(path.join(outside, "config"), "utf8")).toBe("keep me");
		expect((await fs.lstat(path.join(checkout, "plan.md"))).isSymbolicLink()).toBe(false);
		expect(await fs.readFile(path.join(checkout, "plan.md"), "utf8")).toBe("# Plan");
		expect(await fs.readFile(path.join(checkout, "competitors.csv"), "utf8")).toBe("name\nAcme\n");
	});

	it("refuses an output directory that's a symlink out of the checkout", async () => {
		const { checkout, outside } = await checkoutWithOutsideFile();
		await fs.symlink(outside, path.join(checkout, "out"));

		await expect(writeJson(path.join(checkout, "out/nested"), "brand.json", {})).rejects.toThrow(/symlink/);
		await expect(writeText(path.join(checkout, "out"), "config", "overwritten")).rejects.toThrow(/symlink/);
		expect(await fs.readdir(outside)).toEqual(["config"]);
	});

	it("creates nested output directories inside the checkout", async () => {
		const { checkout } = await checkoutWithOutsideFile();

		await writeText(path.join(checkout, "out/responses/001"), "run.md", "answer");

		expect(await fs.readFile(path.join(checkout, "out/responses/001/run.md"), "utf8")).toBe("answer");
		expect(await fs.readdir(path.join(checkout, "out/responses/001"))).toEqual(["run.md"]);
	});
});
