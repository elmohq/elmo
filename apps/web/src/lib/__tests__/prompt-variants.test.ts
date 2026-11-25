import { describe, expect, it } from "vitest";
import { countVariants, groupLeads, insertIntoGroup, orderByGroup, settleParents } from "../prompt-variants";

const row = (id: string, parentId: string | null, value: string, createdAt: string, enabled = true) => ({
	id,
	parentId,
	value,
	createdAt,
	enabled,
});

describe("orderByGroup", () => {
	it("keeps variants under their parent, with groups alphabetical by the parent", () => {
		const ordered = orderByGroup([
			row("3", "1", "a newer wording that sorts first", "2026-03-01"),
			row("2", null, "best crm", "2026-02-01"),
			row("1", null, "top running shoes", "2026-01-01"),
		]);
		expect(ordered.map((r) => r.id)).toEqual(["2", "1", "3"]);
	});

	it("lists a parent first even when a variant is older", () => {
		const ordered = orderByGroup([
			row("old", "new", "older wording", "2026-01-01"),
			row("new", null, "newer wording", "2026-02-01"),
		]);
		expect(ordered.map((r) => r.id)).toEqual(["new", "old"]);
	});

	it("treats a prompt with no variants as a group of one", () => {
		const ordered = orderByGroup([row("b", null, "beta", "2026-01-02"), row("a", null, "alpha", "2026-01-03")]);
		expect(ordered.map((r) => r.id)).toEqual(["a", "b"]);
	});
});

describe("settleParents", () => {
	it("leaves a parent and its variants alone while the parent is tracked", () => {
		const rows = [row("p", null, "", "2026-01-01"), row("v", "p", "", "2026-01-02")];
		expect(settleParents(rows).size).toBe(0);
	});

	it("moves a variant of a variant up to the top prompt", () => {
		const rows = [row("p", null, "", "2026-01-01"), row("v", "p", "", "2026-01-02"), row("w", "v", "", "2026-01-03")];
		expect([...settleParents(rows)]).toEqual([["w", "p"]]);
	});

	it("hands a group to its oldest tracked variant when the parent is disabled", () => {
		const rows = [
			row("p", null, "", "2026-01-01", false),
			row("off", "p", "", "2026-01-02", false),
			row("v", "p", "", "2026-01-03"),
			row("w", "p", "", "2026-01-04"),
		];
		expect(Object.fromEntries(settleParents(rows))).toEqual({ p: "v", off: "v", v: null, w: "v" });
	});

	it("keeps a disabled parent when none of its variants is tracked either", () => {
		const rows = [row("p", null, "", "2026-01-01", false), row("v", "p", "", "2026-01-02", false)];
		expect(settleParents(rows).size).toBe(0);
	});

	it("hands a group on before its parent is removed, leaving the removed prompt alone", () => {
		const rows = [row("p", null, "", "2026-01-01"), row("v", "p", "", "2026-01-02"), row("w", "p", "", "2026-01-03")];
		expect(Object.fromEntries(settleParents(rows, "p"))).toEqual({ v: null, w: "v" });
	});
});

describe("insertIntoGroup", () => {
	const rows = [
		{ key: "a", groupId: "g1" },
		{ key: "a2", groupId: "g1" },
		{ key: "b", groupId: "g2" },
	];

	it("adds a variant after the last row of its group", () => {
		const next = insertIntoGroup(rows, { key: "a3", groupId: "g1" });
		expect(next.map((r) => r.key)).toEqual(["a", "a2", "a3", "b"]);
	});

	it("appends a row that starts a new group", () => {
		const next = insertIntoGroup(rows, { key: "c", groupId: "g3" });
		expect(next.map((r) => r.key)).toEqual(["a", "a2", "b", "c"]);
	});
});

describe("groupLeads and countVariants", () => {
	const rows = [
		{ key: "a", groupId: "g1" },
		{ key: "a2", groupId: "g1" },
		{ key: "b", groupId: "g2" },
	];

	it("names the first row of each group as its lead", () => {
		expect(groupLeads(rows).get("g1")?.key).toBe("a");
		expect(groupLeads(rows).get("g2")?.key).toBe("b");
	});

	it("counts every row beyond a group's lead as a variant", () => {
		expect(countVariants(rows)).toBe(1);
		expect(countVariants([])).toBe(0);
	});
});
