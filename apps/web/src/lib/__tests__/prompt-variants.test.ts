import { describe, expect, it } from "vitest";
import { countVariants, groupLeads, insertIntoGroup, orderByGroup } from "../prompt-variants";

const row = (id: string, groupId: string, value: string, createdAt: string, enabled = true) => ({
	id,
	groupId,
	value,
	createdAt,
	enabled,
});

describe("orderByGroup", () => {
	it("keeps variants under the oldest prompt of their group, with groups alphabetical by that prompt", () => {
		const ordered = orderByGroup([
			row("3", "shoes", "a newer wording that sorts first", "2026-03-01"),
			row("2", "crm", "best crm", "2026-02-01"),
			row("1", "shoes", "top running shoes", "2026-01-01"),
		]);
		expect(ordered.map((r) => r.id)).toEqual(["2", "1", "3"]);
	});

	it("treats a prompt with no variants as a group of one", () => {
		const ordered = orderByGroup([row("b", "g2", "beta", "2026-01-02"), row("a", "g1", "alpha", "2026-01-03")]);
		expect(ordered.map((r) => r.id)).toEqual(["a", "b"]);
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
