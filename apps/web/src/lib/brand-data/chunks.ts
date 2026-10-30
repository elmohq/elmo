/**
 * A brand's data is split into chunks the browser syncs one at a time: its entities, each UTC month of rollups,
 * and each range of cited pages. A refresh rewrites recent buckets, so a sync usually refetches only this month.
 * Rollup chunks carry the server's rollup rows as Arrow, which DuckDB loads into tables shaped like the server's.
 */

/** Bump when a chunk's shape changes; browsers drop copies in any other format. */
export const BRAND_DATA_FORMAT = 3;

export const BRAND_DATA_DB_PREFIX = "elmo-brand-data";

export const ROLLUP_TABLES = {
	runs: ["rollup_prompt_runs", "rollup_competitor_mentions", "rollup_web_queries", "rollup_sentiment_quotes"],
	citations: ["rollup_citation_urls"],
} as const;
export type ChunkGroup = keyof typeof ROLLUP_TABLES;

export interface ChunkManifestEntry {
	id: string;
	version: string;
}

export interface ChunkManifest {
	format: number;
	chunks: ChunkManifestEntry[];
	/** When new data is likely, from the brand's upcoming and running prompt evaluations. */
	nextSyncInSeconds: number;
}

export interface EntityBrand {
	id: string;
	name: string;
	website: string;
	additionalDomains: string[];
	delayOverrideHours: number | null;
}

export interface EntityCompetitor {
	id: string;
	name: string;
	domains: string[];
}

export interface EntityPrompt {
	id: string;
	value: string;
	tags: string[];
	systemTags: string[];
	enabled: boolean;
	createdAt: string;
	firstEvaluatedAt: string | null;
}

export interface EntitiesChunk {
	brand: EntityBrand;
	competitors: EntityCompetitor[];
	prompts: EntityPrompt[];
}

export interface BrandChunk {
	id: string;
	version: string;
	entities?: EntitiesChunk;
	/** Arrow IPC streams by table name. */
	tables?: Record<string, Uint8Array>;
}

export const PAGE_ID_RANGE = 200_000;
/** A page range's chunks split its pages' attributes, which most views need, from their text, which few do. */
export const PAGE_ATTRIBUTES = ["page_id", "domain", "page_type", "static_category"];
export const PAGE_TEXT = ["page_id", "url", "title"];

export const ENTITIES_CHUNK = "entities";
export const monthChunkId = (group: ChunkGroup, month: string) => `${group}:${month}`;
export const isPagesChunk = (id: string) => id.startsWith("pages:");
export const isUrlsChunk = (id: string) => id.startsWith("urls:");

/** The `YYYY-MM` UTC months that overlap `[start, end)`, in minutes since the epoch. */
export function monthsOverlapping(months: Iterable<string>, start: number, end: number): string[] {
	return [...months].filter((month) => {
		const [y, m] = month.split("-").map(Number);
		return Date.UTC(y, m - 1, 1) / 60_000 < end && Date.UTC(y, m, 1) / 60_000 > start;
	});
}

export function monthBounds(month: string): { start: Date; end: Date } {
	const [y, m] = month.split("-").map(Number);
	return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
}

interface FrameHeader {
	id: string;
	version: string;
	entities?: EntitiesChunk;
	tables?: [name: string, bytes: number][];
}

/** Packs chunks into one body: a length-prefixed JSON header, then each table's Arrow bytes in header order. */
export function encodeChunks(chunks: BrandChunk[]): Uint8Array {
	const headers: FrameHeader[] = chunks.map(({ id, version, entities, tables }) => ({
		id,
		version,
		entities,
		tables: tables && Object.entries(tables).map(([name, bytes]) => [name, bytes.byteLength]),
	}));
	const header = new TextEncoder().encode(JSON.stringify(headers));
	const payloads = chunks.flatMap((chunk) => Object.values(chunk.tables ?? {}));
	const body = new Uint8Array(4 + header.byteLength + payloads.reduce((sum, bytes) => sum + bytes.byteLength, 0));
	new DataView(body.buffer).setUint32(0, header.byteLength);
	body.set(header, 4);
	let offset = 4 + header.byteLength;
	for (const bytes of payloads) {
		body.set(bytes, offset);
		offset += bytes.byteLength;
	}
	return body;
}

export function decodeChunks(body: Uint8Array): BrandChunk[] {
	const headerLength = new DataView(body.buffer, body.byteOffset).getUint32(0);
	const headers = JSON.parse(new TextDecoder().decode(body.subarray(4, 4 + headerLength))) as FrameHeader[];
	let offset = 4 + headerLength;
	return headers.map(({ id, version, entities, tables }) => {
		if (!tables) return { id, version, entities };
		const decoded: Record<string, Uint8Array> = {};
		for (const [name, bytes] of tables) {
			decoded[name] = body.slice(offset, offset + bytes);
			offset += bytes;
		}
		return { id, version, tables: decoded };
	});
}
