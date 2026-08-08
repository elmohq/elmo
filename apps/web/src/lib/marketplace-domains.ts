/**
 * Client-side bloom filter for detecting pay-to-win link marketplace domains.
 *
 * The bloom filter is pre-computed at build time from an external CSV
 * (scripts/generate-marketplace-bloom.ts) and served as a static binary asset
 * so the ~111k-domain list never ships to the browser.
 */

// ---------------------------------------------------------------------------
// FNV-1a 32-bit (unsigned) — two independent hash functions for
// Kirsch-Mitzenmacker double-hashing scheme.
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
// Bloom filter (read-only, for membership testing)
// ---------------------------------------------------------------------------
class MarketplaceBloomFilter {
	private readonly bits: Uint8Array;
	readonly numHashes: number;
	readonly bitArraySize: number;

	constructor(data: ArrayBuffer) {
		const view = new DataView(data);
		this.bitArraySize = view.getUint32(0, true);
		this.numHashes = view.getUint8(4);
		this.bits = new Uint8Array(data, 5);
	}

	isMarketplaceDomain(domain: string): boolean {
		const d = domain.toLowerCase();
		const h1 = fnv1a(d);
		const h2 = fnv1aB(d);
		for (let i = 0; i < this.numHashes; i++) {
			const idx = (h1 + i * h2) >>> 0;
			if (!this.getBit(idx % this.bitArraySize)) return false;
		}
		return true;
	}

	private getBit(idx: number): boolean {
		const byteIdx = Math.floor(idx / 8);
		const bitIdx = idx % 8;
		return (this.bits[byteIdx]! & (1 << bitIdx)) !== 0;
	}
}

// ---------------------------------------------------------------------------
// Singleton loader — fetch once, cache forever.
// ---------------------------------------------------------------------------
let cachedFilter: MarketplaceBloomFilter | null = null;
let loadingPromise: Promise<MarketplaceBloomFilter> | null = null;
let loadError: Error | null = null;

async function loadFilter(): Promise<MarketplaceBloomFilter> {
	if (cachedFilter) return cachedFilter;
	if (loadingPromise) return loadingPromise;
	if (loadError) throw loadError;

	loadingPromise = (async () => {
		const resp = await fetch("/data/marketplace-bloom.bin");
		if (!resp.ok) {
			throw new Error(`Failed to load marketplace bloom filter: ${resp.status}`);
		}
		const data = await resp.arrayBuffer();
		cachedFilter = new MarketplaceBloomFilter(data);
		return cachedFilter;
	})();

	try {
		return await loadingPromise;
	} catch (err) {
		loadError = err instanceof Error ? err : new Error(String(err));
		throw loadError;
	}
}

// Start preloading as early as possible
const readyPromise = typeof window !== "undefined" ? loadFilter().then(() => {}) : Promise.resolve();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolves when the bloom filter is ready for synchronous checks.
 */
export function whenReady(): Promise<void> {
	return readyPromise;
}

/**
 * Pre-warm the bloom filter — call early so it's ready by the time the
 * citations page renders. Idempotent.
 */
export function preloadMarketplaceBloom(): void {
	// The eager load at module level already handles this.
}

/**
 * Check whether a domain appears in the pay-to-win marketplace list.
 * Awaits the bloom filter load if needed.
 */
export async function isMarketplaceDomain(domain: string): Promise<boolean> {
	try {
		const filter = await loadFilter();
		return filter.isMarketplaceDomain(domain);
	} catch {
		return false;
	}
}

/**
 * Synchronous check — returns `false` if the bloom filter hasn't loaded yet.
 * Use this in render paths where you can't await.
 */
export function isMarketplaceDomainSync(domain: string): boolean {
	return cachedFilter?.isMarketplaceDomain(domain) ?? false;
}

/**
 * Check multiple domains in one shot. Only awaits the load once.
 */
export async function filterMarketplaceDomains(domains: string[]): Promise<Set<string>> {
	try {
		const filter = await loadFilter();
		const results = new Set<string>();
		for (const d of domains) {
			if (filter.isMarketplaceDomain(d)) {
				results.add(d);
			}
		}
		return results;
	} catch {
		return new Set();
	}
}

export { MarketplaceBloomFilter };