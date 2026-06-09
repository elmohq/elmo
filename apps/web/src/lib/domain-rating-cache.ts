/**
 * Domain Rating (DR) cache + loader + warmer.
 *
 * Two interchangeable backing stores, selected by DR_CACHE_BACKEND:
 *   - "sqlite" (default): a file-backed SQLite db via Node's built-in
 *     `node:sqlite` at DR_CACHE_PATH (default /tmp/elmo-dr-cache.sqlite).
 *     Per-host, may be wiped on deploy — fine for the experiment.
 *   - "postgres": the shared, cross-host `domain_ratings` table (~1-week TTL).
 *     Requires the domain_ratings migration to be applied first.
 * DR is brand-independent, so the cache is global and deduped across every brand.
 * Either way the Ahrefs key-less API is used and transient failures are never
 * written, so the cache can't be poisoned.
 *
 * The loader serves whatever is cached immediately and the warmer fetches a
 * bounded batch of misses per call, so the page fills in over a few polls
 * rather than blocking on ~hundreds of one-domain-per-request Ahrefs calls.
 */
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { inArray, sql } from "drizzle-orm";
import { AhrefsRetryableError, type DomainRatingResult, fetchDomainRating } from "@workspace/lib/ahrefs";
import { domainRatings } from "@workspace/lib/db/schema";
import { extractDomain } from "./domain-categories";

// The pg-backed drizzle client is imported lazily (only when the Postgres
// backend is actually used) so the default SQLite path — and unit tests — never
// construct a database connection.
const getDb = async () => (await import("@workspace/lib/db/db")).db;

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

// ---------------------------------------------------------------------------
// Postgres-backed store — the global, cross-host cache. Opt in with
// DR_CACHE_BACKEND=postgres once the domain_ratings migration is applied.
// Resilient by design: transient Ahrefs failures are never written (no cache
// poisoning), one failing domain never aborts the batch, and DB errors degrade
// gracefully (the section just shows no ratings rather than erroring).
// ---------------------------------------------------------------------------

const PG_OK_TTL_MS = 7 * 24 * 60 * 60 * 1000; // keep "ok" ratings ~1 week
const PG_NOT_FOUND_TTL_MS = 2 * 24 * 60 * 60 * 1000; // recheck not_found sooner

class PostgresDomainRatingStore {
	private inFlight = new Set<string>();

	private isFresh(status: string, fetchedAtMs: number, now: number): boolean {
		return now - fetchedAtMs < (status === "ok" ? PG_OK_TTL_MS : PG_NOT_FOUND_TTL_MS);
	}

	async load(domains: string[], now: number = Date.now()): Promise<LoadResult> {
		const normalized = dedupe(domains.map(extractDomain).filter(Boolean));
		const ratings = new Map<string, number | null>();
		const missing: string[] = [];
		if (normalized.length === 0) return { ratings, missing };
		try {
			const db = await getDb();
			const byDomain = new Map<string, { rating: number | null; status: string; fetchedAt: Date }>();
			for (let i = 0; i < normalized.length; i += 1000) {
				const chunk = normalized.slice(i, i + 1000);
				const rows = await db
					.select({
						domain: domainRatings.domain,
						rating: domainRatings.rating,
						status: domainRatings.status,
						fetchedAt: domainRatings.fetchedAt,
					})
					.from(domainRatings)
					.where(inArray(domainRatings.domain, chunk));
				for (const r of rows) byDomain.set(r.domain, { rating: r.rating, status: r.status, fetchedAt: r.fetchedAt });
			}
			for (const domain of normalized) {
				const row = byDomain.get(domain);
				if (row && this.isFresh(row.status, row.fetchedAt.getTime(), now)) ratings.set(domain, row.rating);
				else missing.push(domain);
			}
			return { ratings, missing };
		} catch (err) {
			console.error("[dr-cache] postgres load failed; serving no ratings", err);
			return { ratings: new Map(), missing: [] };
		}
	}

	async warm(domains: string[], opts: WarmOptions = {}): Promise<{ fetched: number; throttled: boolean }> {
		const { limit = 40, concurrency = 3, budgetMs = 8000, fetcher = fetchDomainRating, now = Date.now } = opts;
		const candidates = dedupe(domains.map(extractDomain).filter(Boolean))
			.filter((d) => !this.inFlight.has(d))
			.slice(0, limit);
		if (candidates.length === 0) return { fetched: 0, throttled: false };

		const start = now();
		let throttled = false;
		let idx = 0;
		const results: { domain: string; rating: number | null; status: string }[] = [];
		const shouldStop = () => throttled || now() - start > budgetMs;

		const worker = async (): Promise<void> => {
			while (idx < candidates.length && !shouldStop()) {
				const domain = candidates[idx++];
				if (this.inFlight.has(domain)) continue;
				this.inFlight.add(domain);
				try {
					// Only definitive results (ok / not_found) are collected; transient
					// failures throw (AhrefsRetryableError) and are skipped, never cached.
					const result = await fetcher(domain);
					results.push({ domain, rating: result.rating, status: result.status });
				} catch (err) {
					if (err instanceof AhrefsRetryableError) throttled = true; // back off; retry next pass
					// other per-domain errors: skip this domain, keep going
				} finally {
					this.inFlight.delete(domain);
				}
			}
		};

		await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, () => worker()));

		if (results.length > 0) {
			try {
				const db = await getDb();
				await db
					.insert(domainRatings)
					.values(results.map((r) => ({ domain: r.domain, rating: r.rating, status: r.status, fetchedAt: new Date(now()) })))
					.onConflictDoUpdate({
						target: domainRatings.domain,
						set: { rating: sql`excluded.rating`, status: sql`excluded.status`, fetchedAt: sql`excluded.fetched_at` },
					});
			} catch (err) {
				console.error("[dr-cache] postgres upsert failed; ratings not persisted", err);
			}
		}
		return { fetched: results.length, throttled };
	}
}

let sqliteSingleton: DomainRatingCache | null = null;
let pgSingleton: PostgresDomainRatingStore | null = null;

function getSqliteCache(): DomainRatingCache {
	if (!sqliteSingleton) sqliteSingleton = new DomainRatingCache(process.env.DR_CACHE_PATH ?? DEFAULT_CACHE_PATH);
	return sqliteSingleton;
}
function getPostgresStore(): PostgresDomainRatingStore {
	if (!pgSingleton) pgSingleton = new PostgresDomainRatingStore();
	return pgSingleton;
}
const isPostgresBackend = () => process.env.DR_CACHE_BACKEND === "postgres";

export function loadDomainRatings(domains: string[]): Promise<LoadResult> {
	return isPostgresBackend() ? getPostgresStore().load(domains) : Promise.resolve(getSqliteCache().load(domains));
}

export function warmDomainRatings(domains: string[], opts?: WarmOptions): Promise<{ fetched: number; throttled: boolean }> {
	return isPostgresBackend() ? getPostgresStore().warm(domains, opts) : getSqliteCache().warm(domains, opts);
}
