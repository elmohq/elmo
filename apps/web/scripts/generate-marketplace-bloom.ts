#!/usr/bin/env tsx
/**
 * Regenerates `src/lib/marketplace-domains.gen.json` from pay-to-win link
 * marketplace exports.
 *
 * Usage:
 *   tsx apps/web/scripts/generate-marketplace-bloom.ts <export.csv>...
 *
 * Each input is a CSV of one marketplace's site list, keyed by a `domain`
 * column; the union of every input goes into the filter. An export that also
 * carries a `link_type` column is narrowed to its `Dofollow` rows — a nofollow
 * placement can't move rankings, so selling one isn't the signal we're
 * flagging. Exports without that column contribute every listing.
 *
 * Domains in EDITORIAL_DOMAINS are dropped: a real newspaper that also runs a
 * sponsored-content desk shouldn't be labelled a link farm.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { BloomFilter } from "bloom-filters";
import { EDITORIAL_DOMAINS } from "../src/lib/editorial-domains";

// 0.001%. Over ~100k domains that's a mislabelled domain about once per
// thousand full passes of the list, which is worth ~430KB of filter.
const FALSE_POSITIVE_RATE = 1e-5;

const OUT_PATH = resolve(import.meta.dirname, "..", "src", "lib", "marketplace-domains.gen.json");

// Platforms and infrastructure that show up in marketplace inventory because
// someone is selling profile or user-generated pages hosted on them. The host
// itself isn't a link farm, and flagging it would tar every citation to it.
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

/**
 * Reads a CSV into header-keyed rows. Hand-rolled because the marketplace
 * exports quote fields containing commas and newlines, which `split` can't
 * survive, and this is the only CSV the repo reads.
 */
function readCsv(path: string): Record<string, string>[] {
	const text = readFileSync(path, "utf-8");
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let quoted = false;

	const endField = () => {
		row.push(field.trim());
		field = "";
	};
	const endRow = () => {
		endField();
		rows.push(row);
		row = [];
	};

	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		if (quoted) {
			if (char !== '"') field += char;
			else if (text[i + 1] === '"') field += text[i++];
			else quoted = false;
		} else if (char === '"') {
			quoted = true;
		} else if (char === ",") {
			endField();
		} else if (char === "\n" || char === "\r") {
			if (char === "\r" && text[i + 1] === "\n") i++;
			if (field || row.length > 0) endRow();
		} else {
			field += char;
		}
	}
	if (field || row.length > 0) endRow();

	const headers = rows.shift();
	if (!headers) return [];
	return rows.map((cells) => Object.fromEntries(headers.map((header, i) => [header.toLowerCase(), cells[i] ?? ""])));
}

function main() {
	const inputs = process.argv.slice(2);
	if (inputs.length === 0) {
		console.error("usage: generate-marketplace-bloom.ts <export.csv>...");
		process.exit(1);
	}

	const listings = inputs.flatMap((input) =>
		readCsv(input).filter((row) => !("link_type" in row) || row.link_type === "Dofollow"),
	);

	const excluded = new Set([...EDITORIAL_DOMAINS, ...PLATFORM_EXCLUSIONS]);
	const domains = [...new Set(listings.map((row) => row.domain?.toLowerCase() ?? ""))]
		.filter((domain) => domain.length > 0 && !excluded.has(domain))
		.sort();

	if (domains.length === 0) {
		console.error("no domains survived filtering — check the inputs have a `domain` column");
		process.exit(1);
	}

	// Tab-indented with a trailing newline so Biome treats the output as already
	// formatted and `pnpm format` leaves the generated file alone.
	const bloom = BloomFilter.from(domains, FALSE_POSITIVE_RATE).saveAsJSON();
	writeFileSync(OUT_PATH, `${JSON.stringify(bloom, null, "\t")}\n`);
	console.log(`wrote ${domains.length.toLocaleString()} domains to ${OUT_PATH}`);
}

main();
