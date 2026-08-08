#!/usr/bin/env tsx
/**
 * Generates a bloom filter from pay-to-win link marketplace domain lists.
 *
 * Filters:
 *   - Adsy:      exact Dofollow link type AND ahrefs organic traffic > 100k
 *   - Collaborator:  ahrefs DR > 30
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
 *   marketplace-bloom.bin   — bloom filter binary
 *   marketplace-domains.txt — full list of domains included (for debugging / transparency)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, dirname, basename } from "node:path";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const FPR = 1e-5; // 0.001% — tiny; obfuscation matters more than space here

const ADS_TRAFFIC_THRESHOLD = 100_000;
const COLLAB_DR_THRESHOLD = 30;

const ADSY_PATH = resolve(homedir(), "code/backlinkeval/adsy-sites.csv");
const COLLAB_PATH = resolve(homedir(), "code/backlinkeval/collaborator-sites.csv");

const OUT_DIR = resolve(
	dirname(new URL(import.meta.url).pathname),
	"..",
	"public",
	"data",
);
const BLOOM_OUT = resolve(OUT_DIR, "marketplace-bloom.bin");
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
//   link_type must be exactly "Dofollow"
//   ahrefs_organic_traffic > 100k
// ---------------------------------------------------------------------------
function filterAdsy(path: string): { included: Map<string, { traffic: number; dr: number }>; rejected: number } {
	const text = readFileSync(path, "utf-8");
	const rows = parseCsv(text);
	if (rows.length < 2) return { included: new Map(), rejected: 0 };

	const headers = rows[0]!;
	const domainIdx = findCol(headers, "domain");
	const linkTypeIdx = findCol(headers, "link_type");
	const ahrefsTrafficIdx = findCol(headers, "ahrefs_organic_traffic");
	const semrushTrafficIdx = findCol(headers, "semrush_total_traffic");
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

		// Must be exactly "Dofollow"
		if (linkType !== "Dofollow") { rejected++; continue; }

		// Check traffic thresholds
		const ahrefsTraffic = ahrefsTrafficIdx !== -1 ? parseFloat(row[ahrefsTrafficIdx] ?? "0") : 0;

		const hasHighTraffic =
			ahrefsTrafficIdx !== -1 && ahrefsTraffic > ADS_TRAFFIC_THRESHOLD;

		if (!hasHighTraffic) { rejected++; continue; }

		const dr = drIdx !== -1 ? parseFloat(row[drIdx] ?? "0") : 0;
		// Keep the entry with the highest traffic for a given domain
		const traffic = ahrefsTraffic;
		const existing = included.get(domain);
		if (!existing || traffic > existing.traffic) {
			included.set(domain, { traffic, dr });
		}
	}

	return { included, rejected };
}

// ---------------------------------------------------------------------------
// Filter Collaborator Pro
//   ahrefs_dr > COLLAB_DR_THRESHOLD
// ---------------------------------------------------------------------------
function filterCollaborator(path: string): { included: Map<string, { traffic: number; dr: number }>; rejected: number } {
	const text = readFileSync(path, "utf-8");
	const rows = parseCsv(text);
	if (rows.length < 2) return { included: new Map(), rejected: 0 };

	const headers = rows[0]!;
	const domainIdx = findCol(headers, "domain");
	const drIdx = findCol(headers, "ahrefs_dr");

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

		if (drIdx !== -1) {
			const drText = row[drIdx]?.trim() ?? "";
			const dr = parseFloat(drText);
			if (isNaN(dr) || dr <= COLLAB_DR_THRESHOLD) {
				rejected++;
				continue;
			}
			included.set(domain, { traffic: 0, dr });
		} else {
			// No DR column — include everything
			included.set(domain, { traffic: 0, dr: 0 });
		}
	}

	return { included, rejected };
}

// ---------------------------------------------------------------------------
// FNV-1a 32-bit (unsigned) — two independent hash functions
// ---------------------------------------------------------------------------
function fnv1a(str: string): number {
	let hash = 0x811c9dc5;
	for (let i = 0; i < str.length; i++) {
		hash ^= str.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

function fnv1aB(str: string): number {
	let hash = 0x84222325;
	for (let i = 0; i < str.length; i++) {
		hash ^= str.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

// ---------------------------------------------------------------------------
// Bloom filter builder
// ---------------------------------------------------------------------------
function buildBloom(
	items: string[],
	falsePositiveRate: number,
): { bits: Uint8Array; numHashes: number; bitArraySize: number } {
	const n = items.length;
	const bitArraySize = Math.ceil((-n * Math.log(falsePositiveRate)) / (Math.LN2 * Math.LN2));
	const numHashes = Math.max(1, Math.round((bitArraySize / n) * Math.LN2));

	const byteSize = Math.ceil(bitArraySize / 8);
	const bits = new Uint8Array(byteSize);

	function setBit(idx: number) {
		const byteIdx = Math.floor(idx / 8);
		const bitIdx = idx % 8;
		bits[byteIdx]! |= 1 << bitIdx;
	}

	for (const item of items) {
		const d = item.toLowerCase();
		const h1 = fnv1a(d);
		const h2 = fnv1aB(d);
		for (let i = 0; i < numHashes; i++) {
			const idx = (h1 + i * h2) >>> 0;
			setBit(idx % bitArraySize);
		}
	}

	return { bits, numHashes, bitArraySize };
}

// ---------------------------------------------------------------------------
// Binary serialization
// ---------------------------------------------------------------------------
function serialize(
	bits: Uint8Array,
	numHashes: number,
	bitArraySize: number,
): Buffer {
	const header = Buffer.alloc(5);
	header.writeUInt32LE(bitArraySize, 0);
	header[4] = numHashes;
	return Buffer.concat([header, Buffer.from(bits)]);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
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

	const allDomains = Array.from(merged.keys());
	console.log(`\nMerged unique domains: ${allDomains.length.toLocaleString()}`);

	// 3. Build bloom filter
	const { bits, numHashes, bitArraySize } = buildBloom(allDomains, FPR);
	const serialized = serialize(bits, numHashes, bitArraySize);

	mkdirSync(OUT_DIR, { recursive: true });
	writeFileSync(BLOOM_OUT, serialized);

	const kb = (serialized.length / 1024).toFixed(1);
	console.log(`\nBloom filter written to ${basename(BLOOM_OUT)}`);
	console.log(`  Bit array: ${(bitArraySize / 8 / 1024).toFixed(1)} KB (${bitArraySize.toLocaleString()} bits)`);
	console.log(`  File size: ${kb} KB`);
	console.log(`  Hashes per lookup: ${numHashes}`);
	console.log(`  Target FPR: ${FPR * 100}%`);

	// 4. Write domain list for debugging / transparency
	const domainLines = allDomains.sort();
	writeFileSync(DOMAINS_OUT, domainLines.join("\n") + "\n");
	console.log(`\nDomain list written to ${basename(DOMAINS_OUT)}`);

	// 5. Write spotcheck candidates (Adsy Dofollow + high traffic)
	const spotcheckLines: string[] = [];
	// Sort by source then traffic descending
	const spotcheckEntries = Array.from(merged.entries())
		.filter(([_, info]) => info.source === "adsy")
		.sort((a, b) => b[1].traffic - a[1].traffic);

	for (const [domain, info] of spotcheckEntries) {
		spotcheckLines.push(`${domain}\ttraffic=${info.traffic.toLocaleString()}\tdr=${info.dr}`);
	}
	writeFileSync(SPOTCHECK_OUT, spotcheckLines.join("\n") + "\n");
	console.log(`\nSpotcheck list written to ${basename(SPOTCHECK_OUT)} (${spotcheckLines.length.toLocaleString()} sites)`);

	// 6. Stats per source
	const adsyCount = spotcheckEntries.length;
	const collabCount = allDomains.length - adsyCount;
	console.log(`\nBreakdown:`);
	console.log(`  Adsy (Dofollow + traffic > ${(ADS_TRAFFIC_THRESHOLD / 1000).toLocaleString()}k): ${adsyCount.toLocaleString()}`);
	console.log(`  Collaborator Pro (DR > ${COLLAB_DR_THRESHOLD}): ${collabCount.toLocaleString()}`);
}

main().catch(console.error);