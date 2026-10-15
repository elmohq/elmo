import { and, isNull, type SQL, sql } from "drizzle-orm";
import { normalizeUrl } from "../citations/domain-categories";
import { classifyPage } from "../citations/page-classification";
import type { DbConnection } from "../db/db-connection";
import { type HeapWalkOptions, onPages, walkHeap } from "../db/heap-walk";
import { citations, citedPages } from "../db/schema";
import type { Citation } from "../text-extraction";
import { chunked } from "./chunk";
import { CLASSIFIER_VERSION } from "./constants";
import { markWritesDirty } from "./dirty";

interface Sighting {
	url: string;
	domain: string;
	title: string | null;
	seenAt: Date;
}

const blankToNull = (value: string | null | undefined): string | null => value?.trim() || null;

/** One page per normalized URL, keeping the most recent non-blank title. */
function foldPages(sightings: Sighting[]) {
	const pages = new Map<string, Sighting & { firstSeenAt: Date }>();
	for (const sighting of [...sightings].sort((a, b) => a.seenAt.getTime() - b.seenAt.getTime())) {
		const url = normalizeUrl(sighting.url);
		const title = blankToNull(sighting.title);
		const page = pages.get(url);
		if (!page) {
			pages.set(url, { ...sighting, url, title, firstSeenAt: sighting.seenAt });
			continue;
		}
		if (title) page.title = title;
		page.seenAt = sighting.seenAt;
	}
	return [...pages.values()]
		.map((page) => ({
			url: page.url,
			domain: page.domain,
			title: page.title,
			...classifyPage(page.url, page.domain, page.title),
			classifierVersion: CLASSIFIER_VERSION,
			firstSeenAt: page.firstSeenAt,
			lastSeenAt: page.seenAt,
		}))
		.sort((a, b) => (a.url < b.url ? -1 : Number(a.url > b.url)));
}

/**
 * Pages are written in any order (replays, backfills), so a page keeps the title
 * seen most recently rather than the last one written: a titled sighting beats an
 * untitled page outright, otherwise the more recent sighting wins. The
 * classification travels with the title it was computed from.
 */
const incomingTitleWins = sql`CASE
	WHEN excluded.title IS NOT NULL THEN (${citedPages.title} IS NULL OR excluded.last_seen_at >= ${citedPages.lastSeenAt})
	ELSE (${citedPages.title} IS NULL AND excluded.last_seen_at >= ${citedPages.lastSeenAt})
END`;

const withTitle = (incoming: SQL, existing: SQL): SQL =>
	sql`CASE WHEN ${incomingTitleWins} THEN ${incoming} ELSE ${existing} END`;

/**
 * Upserts the pages these sightings point at and returns each normalized URL's
 * page id. Pages are shared by every tenant, so the upsert keeps the widest window
 * seen. Rows go in URL order, which keeps concurrent writers from deadlocking.
 */
export async function upsertCitedPages(conn: DbConnection, sightings: Sighting[]): Promise<Map<string, number>> {
	const ids = new Map<string, number>();
	for (const chunk of chunked(foldPages(sightings))) {
		const rows = await conn
			.insert(citedPages)
			.values(chunk)
			.onConflictDoUpdate({
				target: citedPages.url,
				set: {
					domain: sql`excluded.domain`,
					title: withTitle(sql`excluded.title`, sql`${citedPages.title}`),
					pageType: withTitle(sql`excluded.page_type`, sql`${citedPages.pageType}`),
					staticCategory: withTitle(sql`excluded.static_category`, sql`${citedPages.staticCategory}`),
					classifierVersion: withTitle(sql`excluded.classifier_version`, sql`${citedPages.classifierVersion}`),
					firstSeenAt: sql`least(${citedPages.firstSeenAt}, excluded.first_seen_at)`,
					lastSeenAt: sql`greatest(${citedPages.lastSeenAt}, excluded.last_seen_at)`,
				},
			})
			.returning({ id: citedPages.id, url: citedPages.url });
		for (const row of rows) ids.set(row.url, row.id);
	}
	return ids;
}

export interface CitingRun {
	id: string;
	promptId: string;
	brandId: string;
	model: string;
	createdAt: Date;
}

/** Stores a run's citations, each pointing at its page. */
export function insertCitations(conn: DbConnection, run: CitingRun, extracted: Citation[]): Promise<void> {
	return insertRunsCitations(conn, [{ run, citations: extracted }]);
}

/**
 * Stores many runs' citations with one page upsert and one insert, so a replay
 * batch costs a few statements rather than a few per run. The one way citations
 * are written.
 */
export async function insertRunsCitations(
	conn: DbConnection,
	runs: { run: CitingRun; citations: Citation[] }[],
): Promise<void> {
	const withCitations = runs.filter(({ citations: cited }) => cited.length > 0);
	if (withCitations.length === 0) return;
	const pageIds = await upsertCitedPages(
		conn,
		withCitations.flatMap(({ run, citations: cited }) =>
			cited.map((c) => ({ url: c.url, domain: c.domain, title: c.title ?? null, seenAt: run.createdAt })),
		),
	);
	const rows = withCitations.flatMap(({ run, citations: cited }) =>
		cited.map((c) => ({
			promptRunId: run.id,
			promptId: run.promptId,
			brandId: run.brandId,
			model: run.model,
			url: c.url,
			domain: c.domain,
			title: c.title || null,
			citationIndex: c.citationIndex,
			createdAt: run.createdAt,
			pageId: pageIds.get(normalizeUrl(c.url)),
		})),
	);
	for (const chunk of chunked(rows)) await conn.insert(citations).values(chunk);
}

/**
 * Points citations stored before pages were resolved at write time (or written
 * straight to the table by a seed) at their pages, and marks their buckets so the
 * rollups pick them up. Walks the heap newest pages first (see `walkHeap`) and
 * updates each window's rows by ctid, locked so it can't move underneath.
 * Resumable: resolved citations leave the filter.
 */
export function resolveUnpagedCitations(
	conn: DbConnection,
	{ pagesPerStep = 200, ...walk }: HeapWalkOptions & { pagesPerStep?: number } = {},
): Promise<number> {
	return walkHeap(
		conn,
		citations,
		pagesPerStep,
		(from, to) =>
			conn.transaction(async (tx) => {
				const batch = await tx
					.select({
						ctid: sql<string>`${citations}.ctid::text`,
						brandId: citations.brandId,
						url: citations.url,
						domain: citations.domain,
						title: citations.title,
						createdAt: citations.createdAt,
					})
					.from(citations)
					.where(and(onPages(sql`${citations}.ctid`, from, to), isNull(citations.pageId)))
					.for("update");
				if (batch.length === 0) return 0;
				const pageIds = await upsertCitedPages(
					tx,
					batch.map((c) => ({ url: c.url, domain: c.domain, title: c.title, seenAt: c.createdAt })),
				);
				const values = batch.map((c) => sql`(${c.ctid}::tid, ${pageIds.get(normalizeUrl(c.url))}::bigint)`);
				await tx.execute(sql`
				UPDATE ${citations} AS c SET page_id = v.page_id
				FROM (VALUES ${sql.join(values, sql`, `)}) AS v(ctid, page_id)
				WHERE c.ctid = v.ctid
			`);
				await markWritesDirty(
					tx,
					batch.map((c) => ({ brandId: c.brandId, at: c.createdAt })),
				);
				return batch.length;
			}),
		walk,
	);
}
