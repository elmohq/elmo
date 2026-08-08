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
import { BloomFilter, type BloomFilter as BloomFilterInstance } from "@/lib/bloom-filters";

// Matches the output path written by scripts/generate-marketplace-bloom.ts.
// After `vite build`, static assets land under `.output/public/data/`; in dev,
// the Vite dev server serves files directly under `public/`.
const PROD_PATH = resolve(import.meta.dirname, "..", ".output", "public", "data", "marketplace-bloom.json");
const DEV_PATH = resolve(import.meta.dirname, "..", "public", "data", "marketplace-bloom.json");

/**
 * Loads the bloom filter JSON produced by generate-marketplace-bloom.ts.
 *
 * Degrades to an empty (always-false) filter on missing OR corrupt assets so a
 * bad blob never takes down the whole server — the feature silently no-ops.
 * Presence is a hard requirement of the build; a load failure here is logged
 * loudly rather than hidden.
 */
function loadBloomFilter(): BloomFilterInstance {
	const path = existsSync(PROD_PATH) ? PROD_PATH : DEV_PATH;
	try {
		if (!existsSync(path)) {
			console.warn(`[marketplace-filter] bloom filter not found at ${path}; all domains pass through unmarked`);
			return new BloomFilter(1, 1);
		}
		const raw = readFileSync(path, "utf-8");
		return BloomFilter.fromJSON(JSON.parse(raw));
	} catch (err) {
		console.error(`[marketplace-filter] failed to load bloom filter from ${path}:`, err);
		console.warn("[marketplace-filter] all domains pass through unmarked (empty filter fallback)");
		return new BloomFilter(1, 1);
	}
}

const filter: BloomFilterInstance = loadBloomFilter();

/**
 * Check whether a domain appears in the pay-to-win marketplace list.
 * Synchronous, no I/O — call this from the citations endpoint.
 */
export function isMarketplaceDomain(domain: string): boolean {
	return filter.has(domain.toLowerCase());
}
