/**
 * Runs every citation read through Postgres and through a brand's in-memory store
 * and reports any difference. Usage: tsx scripts/brand-data-citation-parity.ts <brandId...>
 */
import { buildBrandBundle } from "@/lib/brand-data/build-bundle.server";
import * as mem from "@/lib/brand-data/memory-citation-reads";
import { decodeBrandBundle, setBrandStore } from "@/lib/brand-data/store";
import * as pg from "@/lib/citation-read";

const normalize = (value: unknown): unknown => {
	if (value instanceof Map) return normalize(Object.fromEntries(value));
	if (Array.isArray(value)) return value.map(normalize);
	if (value && typeof value === "object")
		return Object.fromEntries(
			Object.entries(value)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([k, v]) => [k, typeof v === "number" ? Math.round(v * 1e6) / 1e6 : normalize(v)]),
		);
	return value;
};
/** Arrays whose SQL leaves row order open are compared as sets. */
const asSet = (value: unknown) =>
	Array.isArray(value) ? value.map((v) => JSON.stringify(normalize(v))).sort() : value;

const owned = {
	brandDomains: ["nike.com", "elmohq.com"],
	competitorDomains: ["adidas.com", "profound.com", "reddit.com"],
};
const shiftDay = (days: number) => new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);

const brandIds = process.argv.slice(2);
let failures = 0;
let checks = 0;
for (const brandId of brandIds) {
	const bundle = await buildBrandBundle(brandId);
	setBrandStore(decodeBrandBundle(bundle));
	const prompts = bundle.prompts.filter((p) => p.enabled).map((p) => p.id);
	const windows: unknown[] = [];
	for (const timezone of ["UTC", "America/New_York"])
		for (const days of [7, 30, 400]) {
			// The citations page's calendar windows.
			const scope = { brandId, from: shiftDay(days - 1), to: shiftDay(0), timezone, promptIds: prompts };
			const previous = { ...scope, from: shiftDay(2 * days - 1), to: shiftDay(days) };
			windows.push({ scope, previous } as never);
		}
	// The API's instant windows, and narrower scopes.
	const end = Date.now();
	const start = end - 30 * 864e5;
	const instant = {
		brandId,
		from: new Date(start).toISOString(),
		to: new Date(end).toISOString(),
		timezone: "UTC",
		promptIds: prompts,
	};
	windows.push({
		scope: instant,
		previous: { ...instant, from: new Date(start - 30 * 864e5).toISOString(), to: new Date(start).toISOString() },
	} as never);
	const narrow = {
		brandId,
		from: shiftDay(89),
		to: shiftDay(0),
		timezone: "UTC",
		promptIds: prompts.slice(0, 4),
		model: bundle.dicts.models[0],
	};
	windows.push({ scope: narrow, previous: { ...narrow, from: shiftDay(179), to: shiftDay(90) } } as never);
	const excluded = {
		brandId,
		from: shiftDay(29),
		to: shiftDay(0),
		timezone: "UTC",
		promptIds: prompts,
		excludedPromptIds: prompts.slice(0, 3),
	};
	windows.push({ scope: excluded, previous: { ...excluded, from: shiftDay(59), to: shiftDay(30) } } as never);

	type W = { scope: Parameters<typeof pg.getCitationTotals>[0]; previous: Parameters<typeof pg.getCitationTotals>[0] };
	const reads: [string, (r: typeof pg, w: W) => Promise<unknown>, boolean][] = [
		["getCitationTotals", (r, w) => r.getCitationTotals(w.scope), false],
		[
			"getCitationSummary",
			async (r, w) => {
				const s = await r.getCitationSummary(w.scope, w.previous, owned, { minCount: 2, limit: 10 });
				return { ...s, classes: asSet(s.classes) };
			},
			false,
		],
		[
			"getCitationSummary(minCount 1, limit 50)",
			async (r, w) => {
				const s = await r.getCitationSummary(w.scope, w.previous, owned, { minCount: 1, limit: 50 });
				return { ...s, classes: asSet(s.classes) };
			},
			false,
		],
		["getCitationUrlPage", (r, w) => r.getCitationUrlPage(w.scope, w.previous, owned, {}, 20, 0), false],
		["getCitationUrlPage(page 3)", (r, w) => r.getCitationUrlPage(w.scope, w.previous, owned, {}, 20, 60), false],
		[
			"getCitationUrlPage(search)",
			(r, w) => r.getCitationUrlPage(w.scope, w.previous, owned, { search: "Run" }, 20, 0),
			false,
		],
		[
			"getCitationUrlPage(brand)",
			(r, w) => r.getCitationUrlPage(w.scope, w.previous, owned, { category: "brand" }, 20, 0),
			false,
		],
		[
			"getCitationUrlPage(article)",
			(r, w) => r.getCitationUrlPage(w.scope, w.previous, owned, { pageType: "article" }, 20, 0),
			false,
		],
		[
			"getCitationUrlPage(past end)",
			(r, w) => r.getCitationUrlPage(w.scope, w.previous, owned, {}, 20, 1_000_000),
			false,
		],
		["getCitationDomainPage", (r, w) => r.getCitationDomainPage(w.scope, w.previous, owned, {}, 50, 0), false],
		["getCitationDomainPage(page 2)", (r, w) => r.getCitationDomainPage(w.scope, w.previous, owned, {}, 10, 10), false],
		[
			"getCitationDomainPage(search)",
			(r, w) => r.getCitationDomainPage(w.scope, w.previous, owned, { search: "red" }, 10, 0),
			false,
		],
		[
			"getCitationDomainPage(social)",
			(r, w) => r.getCitationDomainPage(w.scope, w.previous, owned, { category: "social_media" }, 10, 0),
			false,
		],
		[
			"getCitationDomainPage(competitor)",
			(r, w) => r.getCitationDomainPage(w.scope, w.previous, owned, { category: "competitor" }, 10, 0),
			false,
		],
		[
			"getDomainPromptCounts",
			(r, w) => r.getDomainPromptCounts(w.scope, ["reddit.com", "nike.com", "youtube.com", "google.com", "elmohq.com"]),
			false,
		],
		[
			"getCitationFlowRows(reddit.com)",
			async (r, w) => asSet(await r.getCitationFlowRows(w.scope, "reddit.com")),
			false,
		],
		["getCitationFlowRows(nike.com)", async (r, w) => asSet(await r.getCitationFlowRows(w.scope, "nike.com")), false],
		[
			"getCitationFlowRows(elmohq.com)",
			async (r, w) => asSet(await r.getCitationFlowRows(w.scope, "elmohq.com")),
			false,
		],
	];
	const timing: Record<string, [number, number, number]> = {};
	for (const [name, read] of reads) {
		for (const w of windows as unknown as W[]) {
			checks++;
			const a0 = performance.now();
			const expected = await read(pg, w);
			const a1 = performance.now();
			const actual = await read(mem as unknown as typeof pg, w);
			const a2 = performance.now();
			if (!timing[name]) timing[name] = [0, 0, 0];
			const t = timing[name];
			t[2] = Math.max(t[2], a2 - a1);
			t[0] += a1 - a0;
			t[1] += a2 - a1;
			const e = JSON.stringify(normalize(expected));
			const g = JSON.stringify(normalize(actual));
			if (e !== g) {
				failures++;
				if (failures <= 12) {
					console.log(
						`MISMATCH ${brandId} ${name} ${JSON.stringify({ ...w.scope, promptIds: w.scope.promptIds?.length, excludedPromptIds: w.scope.excludedPromptIds?.length })}`,
					);
					let at = 0;
					while (at < e.length && e[at] === g[at]) at++;
					console.log(`  pg : …${e.slice(Math.max(0, at - 150), at + 250)}`);
					console.log(`  mem: …${g.slice(Math.max(0, at - 150), at + 250)}`);
				}
			}
		}
	}
	console.log(`${brandId}:`);
	for (const [name, [p, m, worst]] of Object.entries(timing))
		console.log(
			`  ${name.padEnd(40)} pg ${(p / windows.length).toFixed(1).padStart(7)}ms  memory ${(m / windows.length).toFixed(1).padStart(6)}ms  worst ${worst.toFixed(1).padStart(6)}ms`,
		);
}
console.log(`${checks - failures}/${checks} reads match`);
process.exit(failures ? 1 : 0);
