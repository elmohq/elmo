/**
 * Runs every rollup read through Postgres and through a brand's in-memory store
 * and reports any difference. Usage: tsx scripts/brand-data-parity.ts <brandId...>
 */
import { buildBrandBundle } from "@/lib/brand-data/build-bundle.server";
import * as mem from "@/lib/brand-data/memory-reads";
import { decodeBrandBundle, setBrandStore } from "@/lib/brand-data/store";
import * as pg from "@/lib/rollup-read";

const normalize = (value: unknown): unknown => {
	if (Array.isArray(value))
		return value
			.map(normalize)
			.map((v) => JSON.stringify(v))
			.sort();
	if (value && typeof value === "object")
		return Object.fromEntries(
			Object.entries(value)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([k, v]) => [
					k,
					typeof v === "string" && /_at$|^earliest/.test(k)
						? Date.parse(v)
						: typeof v === "number"
							? Math.round(v * 1e6) / 1e6
							: normalize(v),
				]),
		);
	return value;
};

const brandIds = process.argv.slice(2);
let failures = 0;
let checks = 0;
for (const brandId of brandIds) {
	const t0 = performance.now();
	const bundle = await buildBrandBundle(brandId);
	setBrandStore(decodeBrandBundle(bundle));
	console.log(`${brandId}: bundle built in ${(performance.now() - t0).toFixed(0)}ms`);
	const prompts = bundle.prompts.filter((p) => p.enabled).map((p) => p.id);
	const models = bundle.dicts.models;
	const today = new Date().toISOString().slice(0, 10);
	const shift = (days: number) => new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
	const scopes = [];
	for (const timezone of ["UTC", "America/New_York", "Asia/Kolkata", "Pacific/Chatham"])
		for (const from of [shift(6), shift(29), shift(400)])
			scopes.push({ brandId, from, to: today, timezone, promptIds: prompts });
	scopes.push({ brandId, from: shift(29), to: today, timezone: "UTC", promptIds: prompts.slice(0, 5) });
	scopes.push({ brandId, from: shift(29), to: today, timezone: "UTC", promptIds: [] });
	scopes.push({
		brandId,
		from: shift(90),
		to: today,
		timezone: "UTC",
		promptIds: prompts,
		excludedPromptIds: prompts.slice(0, 3),
	});
	scopes.push({ brandId, from: shift(90), to: today, timezone: "UTC", promptIds: prompts, model: models[0] });
	scopes.push({
		brandId,
		from: shift(90),
		to: today,
		timezone: "UTC",
		promptIds: prompts,
		model: `${models[0]}::premium`,
	});
	scopes.push({ brandId, from: shift(90), to: today, timezone: "UTC", promptIds: prompts, webSearchEnabled: true });
	scopes.push({
		brandId,
		from: new Date(Date.now() - 5 * 864e5).toISOString(),
		to: new Date().toISOString(),
		timezone: "UTC",
		promptIds: prompts,
	});
	scopes.push({ brandId, from: null, to: null, timezone: "UTC" });

	const reads: [string, (r: typeof pg, scope: (typeof scopes)[number]) => Promise<unknown>][] = [
		["getMentionTotals", (r, s) => r.getMentionTotals(s)],
		["getPerPromptDailyRuns", (r, s) => r.getPerPromptDailyRuns(s)],
		["getPerPromptDailyCompetitors", (r, s) => r.getPerPromptDailyCompetitors(s)],
		["getCompetitorTotals", (r, s) => r.getCompetitorTotals(s)],
		["getPerPromptRunStats", (r, s) => r.getPerPromptRunStats(s)],
		["getRunsByModel", (r, s) => r.getRunsByModel(s)],
		[
			"getVisibilityDailyAggregate",
			(r, s) =>
				s.from && s.to && /^\d{4}-/.test(s.from) && s.from.length === 10 && s.promptIds
					? r.getVisibilityDailyAggregate(s as never, (s.promptIds ?? []).slice(0, 4))
					: Promise.resolve(null),
		],
		["getCitationTotal", (r, s) => r.getCitationTotal(s)],
		["getCitationUrlStats", (r, s) => r.getCitationUrlStats(s)],
		["getPerPromptCitationPages", (r, s) => r.getPerPromptCitationPages(s)],
		["getPerPromptGooglePages", (r, s) => r.getPerPromptGooglePages(s)],
		["getPerPromptCitationDomains", (r, s) => r.getPerPromptCitationDomains(s)],
		["getPerPromptDailyCitationDomains", (r, s) => r.getPerPromptDailyCitationDomains(s)],
		[
			"getPerPromptDailyCitationClasses",
			(r, s) =>
				r.getPerPromptDailyCitationClasses(s, {
					brandDomains: ["nike.com", "elmohq.com"],
					competitorDomains: ["adidas.com", "profound.com", "reddit.com"],
				}),
		],
		["getCitationsCountByModel", (r, s) => r.getCitationsCountByModel(s)],
		["getFanoutBreakdown", (r, s) => r.getFanoutBreakdown(s)],
		["getFanoutModelTotals", (r, s) => r.getFanoutModelTotals(s)],
		["getFanoutQueryPage", (r, s) => r.getFanoutQueryPage(s, "nike", 20, 5)],
		["getFanoutQueryTotals", (r, s) => r.getFanoutQueryTotals(s)],
		["getFanoutPromptTotals", (r, s) => r.getFanoutPromptTotals(s)],
		["getDailyAssessments", (r, s) => r.getDailyAssessments(s)],
		["getPromptModelDailyRuns", (r, s) => r.getPromptModelDailyRuns(s)],
		["getPromptModelDailyCompetitors", (r, s) => r.getPromptModelDailyCompetitors(s)],
	];
	const timing: Record<string, [number, number]> = {};
	for (const [name, read] of reads) {
		for (const scope of scopes) {
			checks++;
			const a0 = performance.now();
			const expected = await read(pg, scope);
			const a1 = performance.now();
			const actual = await read(mem as unknown as typeof pg, scope);
			const a2 = performance.now();
			const t = (timing[name] ??= [0, 0]);
			t[0] += a1 - a0;
			t[1] += a2 - a1;
			const e = JSON.stringify(normalize(expected));
			const g = JSON.stringify(normalize(actual));
			if (e !== g) {
				failures++;
				if (failures <= 15) {
					console.log(`MISMATCH ${name} ${JSON.stringify({ ...scope, promptIds: scope.promptIds?.length })}`);
					console.log(`  pg : ${e.slice(0, 300)}`);
					console.log(`  mem: ${g.slice(0, 300)}`);
				}
			}
		}
	}
	for (const [name, [p, m]] of Object.entries(timing))
		console.log(
			`  ${name.padEnd(34)} pg ${(p / scopes.length).toFixed(1).padStart(7)}ms  memory ${(m / scopes.length).toFixed(1).padStart(6)}ms`,
		);
}
console.log(`${checks - failures}/${checks} reads match`);
process.exit(failures ? 1 : 0);
