/**
 * Domain Rating (DR) cache + loader + warmer.
 *
 * TEMPORARY/EXPERIMENTAL backing store: a file-backed SQLite database via Node's
 * built-in `node:sqlite` at DR_CACHE_PATH (default /tmp/elmo-dr-cache.sqlite).
 * DR is brand-independent, so this cache is global and deduped across every
 * brand. It's per-host (not shared across hosts) and may be wiped on deploy —
 * which is acceptable while we evaluate whether the DR↔citation findings are
 * useful. If they graduate, swap the store for a Postgres `domain_ratings`
 * table behind this same load/warm interface (no API key is needed either way).
 *
 * The loader serves whatever is cached immediately and the warmer fetches a
 * bounded batch of misses per call, so the page fills in over a few polls
 * rather than blocking on ~hundreds of one-domain-per-request Ahrefs calls.
 */
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { AhrefsRetryableError, type DomainRatingResult, fetchDomainRating } from "@workspace/lib/ahrefs";
import { extractDomain } from "./domain-categories";

const DEFAULT_CACHE_PATH = "/tmp/elmo-dr-cache.sqlite";
const OK_TTL_MS = 30 * 24 * 60 * 60 * 1000; // refresh "ok" ratings every ~30 days
const RETRY_TTL_MS = 3 * 24 * 60 * 60 * 1000; // retry not_found/error rows after ~3 days

export interface LoadResult {
	/** Resolved domains → rating (null = fetched, but Ahrefs had no rating). */
	ratings: Map<string, number | null>;
	/** Domains that still need a fetch (absent or stale). */
	missing: string[];
}

export interface WarmOptions {
	limit?: number;
	concurrency?: number;
	budgetMs?: number;
	/** Injectable for tests; defaults to the real Ahrefs client. */
	fetcher?: (domain: string) => Promise<DomainRatingResult>;
	/** Injectable clock for tests. */
	now?: () => number;
}

interface RatingRow {
	domain: string;
	rating: number | null;
	status: string;
	fetched_at: number;
}

function dedupe(values: string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const v of values) {
		if (!v || seen.has(v)) continue;
		seen.add(v);
		out.push(v);
	}
	return out;
}

export class DomainRatingCache {
	private db: DatabaseSync;
	private inFlight = new Set<string>();

	constructor(path: string) {
		if (path !== ":memory:") {
			const dir = dirname(path);
			if (dir && dir !== "." && !existsSync(dir)) mkdirSync(dir, { recursive: true });
		}
		this.db = new DatabaseSync(path);
		this.db.exec("PRAGMA journal_mode = WAL");
		this.db.exec("PRAGMA busy_timeout = 5000");
		this.db.exec(
			`CREATE TABLE IF NOT EXISTS domain_ratings (
				domain TEXT PRIMARY KEY,
				rating REAL,
				status TEXT NOT NULL,
				fetched_at INTEGER NOT NULL
			)`,
		);
	}

	private isFresh(row: RatingRow, now: number): boolean {
		const ttl = row.status === "ok" ? OK_TTL_MS : RETRY_TTL_MS;
		return now - row.fetched_at < ttl;
	}

	private selectRows(domains: string[]): RatingRow[] {
		const out: RatingRow[] = [];
		for (let i = 0; i < domains.length; i += 500) {
			const chunk = domains.slice(i, i + 500);
			const placeholders = chunk.map(() => "?").join(",");
			const rows = this.db
				.prepare(`SELECT domain, rating, status, fetched_at FROM domain_ratings WHERE domain IN (${placeholders})`)
				.all(...chunk) as unknown as RatingRow[];
			out.push(...rows);
		}
		return out;
	}

	upsert(domain: string, rating: number | null, status: string, fetchedAt: number): void {
		this.db
			.prepare(
				`INSERT INTO domain_ratings (domain, rating, status, fetched_at)
				VALUES (?, ?, ?, ?)
				ON CONFLICT(domain) DO UPDATE SET
					rating = excluded.rating, status = excluded.status, fetched_at = excluded.fetched_at`,
			)
			.run(domain, rating, status, fetchedAt);
	}

	/** Look up cached ratings; "missing" = absent or stale (needs a warm pass). */
	load(domains: string[], now: number = Date.now()): LoadResult {
		const normalized = dedupe(domains.map(extractDomain).filter(Boolean));
		const ratings = new Map<string, number | null>();
		const missing: string[] = [];
		if (normalized.length === 0) return { ratings, missing };

		const byDomain = new Map(this.selectRows(normalized).map((r) => [r.domain, r]));
		for (const domain of normalized) {
			const row = byDomain.get(domain);
			if (row && this.isFresh(row, now)) ratings.set(domain, row.rating);
			else missing.push(domain);
		}
		return { ratings, missing };
	}

	/**
	 * Fetch DR for up to `limit` missing domains with bounded concurrency. Stops
	 * early when the time budget is exhausted or Ahrefs throttles us (429/5xx),
	 * leaving un-fetched domains for the next pass. Unexpected per-domain errors
	 * skip just that domain.
	 */
	async warm(domains: string[], opts: WarmOptions = {}): Promise<{ fetched: number; throttled: boolean }> {
		const { limit = 40, concurrency = 3, budgetMs = 8000, fetcher = fetchDomainRating, now = Date.now } = opts;
		const candidates = dedupe(domains.map(extractDomain).filter(Boolean))
			.filter((d) => !this.inFlight.has(d))
			.slice(0, limit);
		if (candidates.length === 0) return { fetched: 0, throttled: false };

		const start = now();
		let throttled = false;
		let fetched = 0;
		let idx = 0;
		const shouldStop = () => throttled || now() - start > budgetMs;

		const worker = async (): Promise<void> => {
			while (idx < candidates.length && !shouldStop()) {
				const domain = candidates[idx++];
				if (this.inFlight.has(domain)) continue;
				this.inFlight.add(domain);
				try {
					const result = await fetcher(domain);
					this.upsert(domain, result.rating, result.status, now());
					fetched++;
				} catch (err) {
					if (err instanceof AhrefsRetryableError) throttled = true; // back off; retry next pass
					// otherwise skip just this domain and continue
				} finally {
					this.inFlight.delete(domain);
				}
			}
		};

		await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, () => worker()));
		return { fetched, throttled };
	}
}

let singleton: DomainRatingCache | null = null;
function getCache(): DomainRatingCache {
	if (!singleton) singleton = new DomainRatingCache(process.env.DR_CACHE_PATH ?? DEFAULT_CACHE_PATH);
	return singleton;
}

export function loadDomainRatings(domains: string[]): LoadResult {
	return getCache().load(domains);
}

export function warmDomainRatings(domains: string[], opts?: WarmOptions): Promise<{ fetched: number; throttled: boolean }> {
	return getCache().warm(domains, opts);
}
