#!/usr/bin/env tsx
/**
 * Generates a bloom filter from pay-to-win link marketplace domain lists.
 *
 * Filters:
 *   - Adsy:      exact Dofollow link type (all traffic levels)
 *   - Collaborator:  all domains (no traffic/DR filter)
 *   - Both:     cross-referenced against apps/web/src/lib/editorial-domains.ts
 *               (legitimate editorial/news publisher domains that may sell
 *                sponsored content but aren't spammy backlink farms) — those
 *                are excluded from the bloom filter.
 *               Also excludes a small set of platform/infrastructure domains
 *               (e.g. LinkedIn, NCBI, Patreon).
 *
 * The spotcheck list uses the traffic > 100k filter to produce a manageable
 * set for manual review — this doesn't affect what goes into the bloom filter.
 *
 * The filtered domain list is saved alongside the bloom filter so you can
 * spotcheck high-traffic Adsy candidates for false positives.
 *
 * Usage:
 *   tsx apps/web/scripts/generate-marketplace-bloom.ts
 *
 * Inputs (from ~/code/backlinkeval/):
 *   adsy-sites.csv           — structured marketplace CSV with link_type, ahrefs_organic_traffic
 *   collaborator-sites.csv   — free-text marketplace CSV with ahrefs_dr
 *
 * Outputs (to apps/web/public/data/):
 *   marketplace-bloom.json   — bloom filter JSON (loaded server-side at startup)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, dirname, basename } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { BloomFilter } = require("bloom-filters");

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const FPR = 1e-5; // 0.001% — tiny; obfuscation matters more than space here

const ADSY_PATH = resolve(homedir(), "code/backlinkeval/adsy-sites.csv");
const COLLAB_PATH = resolve(homedir(), "code/backlinkeval/collaborator-sites.csv");

// ---------------------------------------------------------------------------
// Exclusion: domains that are clearly NOT spammy backlink farms.
// These are legitimate platforms, infrastructure, or tools that appear on
// marketplaces but aren't pay-to-win content farms.
// ---------------------------------------------------------------------------
const PLATFORM_EXCLUSIONS = new Set([
	"linkedin.com",
	"ncbi.nlm.nih.gov",
	"msn.com",
	"patreon.com",
	"kickstarter.com",
	"notion.com",
	"picsart.com",
	"canva.com",
	"codepen.io",
	"storage.googleapis.com",
	"podcasts.apple.com",
	"gimkit.com",
	"pewresearch.org",
	"placeit.net",
	"spocket.co",
	"sendpulse.com",
]);

const OUT_DIR = resolve(
	dirname(new URL(import.meta.url).pathname),
	"..",
	"public",
	"data",
);
const BLOOM_OUT = resolve(OUT_DIR, "marketplace-bloom.json");
const DOMAINS_OUT = resolve(OUT_DIR, "..", "..", "scripts", "marketplace-domains.txt");
const SPOTCHECK_OUT = resolve(OUT_DIR, "..", "..", "scripts", "marketplace-spotcheck.txt");

// ---------------------------------------------------------------------------
// CSV parsing (lenient — handles the collaborator CSV which has variable
// column counts and embedded commas / newlines within quoted fields).
// ---------------------------------------------------------------------------
function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let inQuotes = false;

	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		const next = text[i + 1];

		if (inQuotes) {
			if (ch === '"' && next === '"') {
				field += '"';
				i++; // skip escaped quote
			} else if (ch === '"') {
				inQuotes = false;
			} else {
				field += ch;
			}
		} else {
			if (ch === '"') {
				inQuotes = true;
			} else if (ch === ",") {
				row.push(field.trim());
				field = "";
			} else if (ch === "\n" || ch === "\r") {
				if (ch === "\r" && next === "\n") i++; // CRLF
				if (field || row.length > 0) {
					row.push(field.trim());
					rows.push(row);
				}
				row = [];
				field = "";
			} else {
				field += ch;
			}
		}
	}
	// Catch the last row if no trailing newline
	if (field || row.length > 0) {
		row.push(field.trim());
		rows.push(row);
	}

	return rows;
}

function findCol(headers: string[], name: string): number {
	const lc = name.toLowerCase();
	return headers.findIndex((h) => h.toLowerCase() === lc);
}

// ---------------------------------------------------------------------------
// Filter Adsy
// ---------------------------------------------------------------------------
function filterAdsy(path: string): { included: Map<string, { traffic: number; dr: number }>; rejected: number } {
	const text = readFileSync(path, "utf-8");
	const rows = parseCsv(text);
	if (rows.length < 2) return { included: new Map(), rejected: 0 };

	const headers = rows[0]!;
	const domainIdx = findCol(headers, "domain");
	const linkTypeIdx = findCol(headers, "link_type");
	const ahrefsTrafficIdx = findCol(headers, "ahrefs_organic_traffic");
	const drIdx = findCol(headers, "ahrefs_dr");

	if (domainIdx === -1 || linkTypeIdx === -1) {
		console.error("Adsy CSV missing required columns");
		return { included: new Map(), rejected: rows.length - 1 };
	}

	const included = new Map<string, { traffic: number; dr: number }>();
	let rejected = 0;

	for (let i = 1; i < rows.length; i++) {
		const row = rows[i]!;
		const domain = row[domainIdx]?.trim().toLowerCase() ?? "";
		if (!domain) { rejected++; continue; }

		const linkType = row[linkTypeIdx]?.trim() ?? "";

		if (linkType !== "Dofollow") { rejected++; continue; }

		const traffic = ahrefsTrafficIdx !== -1 ? parseFloat(row[ahrefsTrafficIdx] ?? "0") : 0;
		const dr = drIdx !== -1 ? parseFloat(row[drIdx] ?? "0") : 0;
		const existing = included.get(domain);
		if (!existing || traffic > existing.traffic) {
			included.set(domain, { traffic, dr });
		}
	}

	return { included, rejected };
}

// ---------------------------------------------------------------------------
// Filter Collaborator Pro
// ---------------------------------------------------------------------------
function filterCollaborator(path: string): { included: Map<string, { traffic: number; dr: number }>; rejected: number } {
	const text = readFileSync(path, "utf-8");
	const rows = parseCsv(text);
	if (rows.length < 2) return { included: new Map(), rejected: 0 };

	const headers = rows[0]!;
	const domainIdx = findCol(headers, "domain");

	if (domainIdx === -1) {
		console.error("Collaborator CSV missing 'domain' column");
		return { included: new Map(), rejected: rows.length - 1 };
	}

	const included = new Map<string, { traffic: number; dr: number }>();
	let rejected = 0;

	for (let i = 1; i < rows.length; i++) {
		const row = rows[i]!;
		const domain = row[domainIdx]?.trim().toLowerCase() ?? "";
		if (!domain) { rejected++; continue; }
		if (!included.has(domain)) {
			included.set(domain, { traffic: 0, dr: 0 });
		}
	}

	return { included, rejected };
}

// ---------------------------------------------------------------------------
// Exclusion: editorial domains
// ---------------------------------------------------------------------------
const EDITORIAL_DOMAINS_PATH = resolve(
	dirname(new URL(import.meta.url).pathname),
	"..",
	"src",
	"lib",
	"editorial-domains.ts",
);

function loadEditorialDomains(path: string): Set<string> {
	const text = readFileSync(path, "utf-8");
	const domains = new Set<string>();
	const re = /"([a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+)"/gi;
	let match;
	while ((match = re.exec(text)) !== null) {
		domains.add(match[1]!.toLowerCase());
	}
	return domains;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
	if (!existsSync(ADSY_PATH)) {
		console.error(`Adsy CSV not found at ${ADSY_PATH}`);
		process.exit(1);
	}
	if (!existsSync(COLLAB_PATH)) {
		console.error(`Collaborator CSV not found at ${COLLAB_PATH}`);
		process.exit(1);
	}

	// 1. Filter both sources
	console.log("Filtering Adsy...");
	const adsy = filterAdsy(ADSY_PATH);
	console.log(`  Included: ${adsy.included.size.toLocaleString()}, Rejected: ${adsy.rejected.toLocaleString()}`);

	console.log("Filtering Collaborator Pro...");
	const collab = filterCollaborator(COLLAB_PATH);
	console.log(`  Included: ${collab.included.size.toLocaleString()}, Rejected: ${collab.rejected.toLocaleString()}`);

	// 2. Merge (Adsy takes priority for dupe domains)
	const merged = new Map<string, { source: string; traffic: number; dr: number }>();
	for (const [domain, info] of adsy.included) {
		merged.set(domain, { ...info, source: "adsy" });
	}
	for (const [domain, info] of collab.included) {
		if (!merged.has(domain)) {
			merged.set(domain, { ...info, source: "collaborator" });
		}
	}

	let allDomains = Array.from(merged.keys());
	console.log(`\nMerged unique domains: ${allDomains.length.toLocaleString()}`);

	// 3. Exclude legitimate editorial domains
	console.log("Excluding editorial and platform domains...");
	const editorialDomains = loadEditorialDomains(EDITORIAL_DOMAINS_PATH);
	const beforeExclusion = allDomains.length;
	const excluded: string[] = [];
	const excludedPlatforms: string[] = [];
	allDomains = allDomains.filter((d) => {
		if (editorialDomains.has(d)) {
			excluded.push(d);
			return false;
		}
		if (PLATFORM_EXCLUSIONS.has(d)) {
			excludedPlatforms.push(d);
			return false;
		}
		return true;
	});
	console.log(`  Removed: ${excluded.length.toLocaleString()} editorial domain(s)`);
	console.log(`  Removed: ${excludedPlatforms.length.toLocaleString()} platform domain(s)`);
	console.log(`  After exclusion: ${allDomains.length.toLocaleString()}`);

	// 4. Build bloom filter using the library
	const filter = BloomFilter.from(allDomains, FPR);
	const json = filter.saveAsJSON();

	mkdirSync(OUT_DIR, { recursive: true });
	writeFileSync(BLOOM_OUT, JSON.stringify(json));

	const kb = (JSON.stringify(json).length / 1024).toFixed(1);
	console.log(`\nBloom filter written to ${basename(BLOOM_OUT)}`);
	console.log(`  File size: ${kb} KB`);
	console.log(`  Elements: ${allDomains.length.toLocaleString()}`);
	console.log(`  Target FPR: ${FPR * 100}%`);

	// 5. Write domain list for debugging / transparency
	const domainLines = allDomains.sort();
	writeFileSync(DOMAINS_OUT, domainLines.join("\n") + "\n");
	console.log(`\nDomain list written to ${basename(DOMAINS_OUT)}`);

	// 6. Write spotcheck candidates (Adsy Dofollow + traffic > 100k)
	const SPOTCHECK_TRAFFIC = 100_000;
	const spotcheckLines: string[] = [];
	const spotcheckSet = new Set(allDomains);
	const spotcheckEntries = Array.from(merged.entries())
		.filter(
			([domain, info]) =>
				info.source === "adsy" && info.traffic > SPOTCHECK_TRAFFIC && spotcheckSet.has(domain),
		)
		.sort((a, b) => b[1].traffic - a[1].traffic);

	for (const [domain, info] of spotcheckEntries) {
		spotcheckLines.push(`${domain}\ttraffic=${info.traffic.toLocaleString()}\tdr=${info.dr}`);
	}
	writeFileSync(SPOTCHECK_OUT, spotcheckLines.join("\n") + "\n");
	console.log(
		`\nSpotcheck list written to ${basename(SPOTCHECK_OUT)} (${spotcheckLines.length.toLocaleString()} sites)`,
	);

	// 7. Stats per source
	const adsyFinalCount = Array.from(merged.entries()).filter(([_, info]) => info.source === "adsy").length;
	const collabFinalCount = Array.from(merged.entries()).filter(([_, info]) => info.source === "collaborator").length;
	console.log(`\nBreakdown:`);
	console.log(`  Adsy (Dofollow): ${adsyFinalCount.toLocaleString()}`);
	console.log(`  Collaborator Pro: ${collabFinalCount.toLocaleString()}`);
	console.log(`  Total before exclusion: ${(adsyFinalCount + collabFinalCount).toLocaleString()}`);
}

main();