import { describe, expect, it } from "vitest";
import { companyColorMap, OTHERS_COLOR } from "@/lib/company-colors";

const colors = ["#111111", "#222222", "#333333"];
const brand = (name: string) => ({ name, isBrand: true });
const competitor = (name: string) => ({ name, isBrand: false });

describe("companyColorMap", () => {
	it("gives the brand the first colour and competitors the following colours", () => {
		const map = companyColorMap([brand("Acme"), competitor("Globex"), competitor("Initech")], colors);

		expect(map).toEqual(
			new Map([
				["Acme", "#111111"],
				["Globex", "#222222"],
				["Initech", "#333333"],
			]),
		);
	});

	it("gives the brand the first colour wherever it appears in the list", () => {
		const map = companyColorMap([competitor("Globex"), brand("Acme"), competitor("Initech")], colors);

		expect(map.get("Globex")).toBe("#222222");
		expect(map.get("Acme")).toBe("#111111");
		expect(map.get("Initech")).toBe("#333333");
	});

	it("reserves the first colour when there is no brand", () => {
		const map = companyColorMap([competitor("Globex"), competitor("Initech")], colors);

		expect(map.get("Globex")).toBe("#222222");
		expect(map.get("Initech")).toBe("#333333");
	});

	it("groups companies past the available colours under the others colour", () => {
		const map = companyColorMap(
			[brand("Acme"), competitor("Globex"), competitor("Initech"), competitor("Umbrella"), competitor("Hooli")],
			colors,
		);

		expect(map.get("Umbrella")).toBe(OTHERS_COLOR);
		expect(map.get("Hooli")).toBe(OTHERS_COLOR);
	});

	it("adds an entry for every distinct company name", () => {
		const map = companyColorMap([brand("Acme"), competitor("Globex"), competitor("Globex")], colors);

		expect(map.size).toBe(2);
		expect([...map.keys()]).toEqual(["Acme", "Globex"]);
	});

	it("returns an empty map for an empty list", () => {
		expect(companyColorMap([], colors)).toEqual(new Map());
	});
});
