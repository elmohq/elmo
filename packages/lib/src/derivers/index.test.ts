import { describe, expect, it } from "vitest";
import type { Brand, Competitor } from "../db/schema";
import { brandContextFrom, currentVersions, DERIVERS, deriveAll, staleDerivers, versionStamp } from "./index";
import { mentionsDeriver } from "./mentions";
import type { BrandContext } from "./types";

const ctx: BrandContext = {
	brand: {
		name: "Acme",
		aliases: ["Acme Corp"],
		website: "https://acme.com",
		additionalDomains: ["acme.io", "acme.dev"],
	},
	competitors: [
		{ name: "Globex", aliases: ["Globex Inc"], domains: ["globex.com"] },
		{ name: "Initech", aliases: [], domains: ["initech.com"] },
	],
};

const stampOf = (context: BrandContext) => versionStamp(mentionsDeriver, context);

describe("version stamps", () => {
	it("changes when the brand gains an alias", () => {
		const withAlias = { ...ctx, brand: { ...ctx.brand, aliases: [...ctx.brand.aliases, "Acme Software"] } };
		expect(stampOf(withAlias)).not.toBe(stampOf(ctx));
	});

	it("changes when a competitor's domain changes", () => {
		const moved = {
			...ctx,
			competitors: [{ ...ctx.competitors[0], domains: ["globex.io"] }, ctx.competitors[1]],
		};
		expect(stampOf(moved)).not.toBe(stampOf(ctx));
	});

	it("survives reordering, so a bulk competitor save does not restamp history", () => {
		const reordered: BrandContext = {
			brand: { ...ctx.brand, additionalDomains: [...ctx.brand.additionalDomains].reverse() },
			competitors: [...ctx.competitors].reverse(),
		};
		expect(stampOf(reordered)).toBe(stampOf(ctx));
	});

	it("survives a case or whitespace edit, which matching already ignores", () => {
		const recased: BrandContext = {
			brand: {
				name: "ACME ",
				aliases: [" acme corp"],
				website: "https://WWW.acme.com",
				additionalDomains: ["https://acme.dev/", "Acme.io"],
			},
			competitors: [
				{ name: "Globex ", aliases: ["globex inc "], domains: ["www.Globex.com"] },
				{ name: " Initech", aliases: [], domains: ["https://initech.com/about"] },
			],
		};
		expect(stampOf(recased)).toBe(stampOf(ctx));
	});

	it("changes when a competitor is renamed, even only in case, since rollups key on the stored name", () => {
		const recased = { ...ctx, competitors: [{ ...ctx.competitors[0], name: "GLOBEX" }, ctx.competitors[1]] };
		expect(stampOf(recased)).not.toBe(stampOf(ctx));
	});
});

describe("staleDerivers", () => {
	it("treats an unstamped run as stale for every deriver", () => {
		expect(staleDerivers({}, ctx)).toEqual([...DERIVERS]);
	});

	it("reports nothing stale for a run stamped with the current configuration", () => {
		expect(staleDerivers(currentVersions(ctx), ctx)).toEqual([]);
	});

	it("reports a run stale once its configuration moves on", () => {
		const stored = currentVersions(ctx);
		const renamed = { ...ctx, brand: { ...ctx.brand, aliases: ["Acme Software"] } };
		expect(staleDerivers(stored, renamed).map((deriver) => deriver.name)).toEqual(["mentions"]);
	});

	it("restricts the answer to the named derivers", () => {
		expect(staleDerivers({}, ctx, DERIVERS, ["mentions"]).map((deriver) => deriver.name)).toEqual(["mentions"]);
		expect(staleDerivers({}, ctx, DERIVERS, ["ads"])).toEqual([]);
	});
});

describe("deriveAll", () => {
	const input = {
		textContent: "Acme Corp and globex.com are the usual picks.",
		rawOutput: null,
		provider: "openai-api",
		model: "gpt-5",
	};

	it("writes every deriver's columns alongside the stamps that produced them", () => {
		const { columns, versions } = deriveAll(input, ctx);
		expect(columns).toEqual({ brandMentioned: true, competitorsMentioned: ["Globex"] });
		expect(versions).toEqual(currentVersions(ctx));
	});

	it("reports no mentions when extraction found no text", () => {
		const { columns } = deriveAll({ ...input, textContent: null }, ctx);
		expect(columns).toEqual({ brandMentioned: false, competitorsMentioned: [] });
	});
});

describe("brandContextFrom", () => {
	it("reads a brand and its competitors, tolerating absent arrays", () => {
		const brand = {
			name: "Acme",
			website: "https://acme.com",
			aliases: null,
			additionalDomains: null,
		} as unknown as Brand;
		const competitors = [{ name: "Globex", aliases: null, domains: null }] as unknown as Competitor[];

		expect(brandContextFrom(brand, competitors)).toEqual({
			brand: { name: "Acme", aliases: [], website: "https://acme.com", additionalDomains: [] },
			competitors: [{ name: "Globex", aliases: [], domains: [] }],
		});
	});
});
