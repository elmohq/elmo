/**
 * Server-side singleton loader for the marketplace bloom filter.
 *
 * Loads the pre-computed bloom filter JSON once at module-init time (cold
 * start) and serves membership checks synchronously.  No bloom filter code
 * ships to the browser — the server stamps `isMarketplace` onto each domain
 * before the response leaves the server.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { BloomFilter } = require("bloom-filters");

// The path the file will live at after `vite build` (static assets get copied
// into `.output/public/data/` by the Vite static plugin).  Also fall back to
// a dev-time location under `public/` for local development.
// We try both so that `pnpm dev` (Vite dev server) works too (the dev server
// serves files under `public/` relative to the project root).
const PROD_PATH = resolve(import.meta.dirname, "..", ".output", "public", "data", "marketplace-bloom.json");
const DEV_PATH = resolve(import.meta.dirname, "..", "public", "data", "marketplace-bloom.json");

function loadBloomFilter(): BloomFilter {
	const path = existsSync(PROD_PATH) ? PROD_PATH : DEV_PATH;
	if (!existsSync(path)) {
		console.warn(`[marketplace-filter] bloom filter not found at ${path}; all domains pass through unmarked`);
		// Return a filter that always returns false — safe no-op.
		const empty = new BloomFilter(1, 1);
		return empty;
	}
	const raw = readFileSync(path, "utf-8");
	const json = JSON.parse(raw);
	return BloomFilter.fromJSON(json);
}

const filter: BloomFilter = loadBloomFilter();

/**
 * Check whether a domain appears in the pay-to-win marketplace list.
 * Synchronous, no I/O — call this from the citations endpoint.
 */
export function isMarketplaceDomain(domain: string): boolean {
	return filter.has(domain.toLowerCase());
}