import {
	BRAND_DATA_DB_PREFIX,
	BRAND_DATA_FORMAT,
	type BrandChunk,
	type ChunkManifest,
	type ChunkManifestEntry,
	decodeChunks,
	ENTITIES_CHUNK,
	type EntitiesChunk,
	isPagesChunk,
	isUrlsChunk,
} from "@/lib/brand-data/chunks";
import type { Coverage } from "@/lib/brand-data/coverage";
import { removeBrandDataFiles } from "@/lib/brand-data/duck/browser";
import {
	applyChunk,
	compactRollups,
	type DuckEngineConnection,
	joinPages,
	removeBrand,
	removeChunk,
	storedBrand,
	storeManifest,
} from "@/lib/brand-data/duck/engine";

const BATCH_SIZE = 3;
const PARALLEL_REQUESTS = 2;
const MAX_BRANDS = 3;

/** Clears what earlier builds kept: IndexedDB copies and other formats' database files. */
export async function removeOtherFormats() {
	const databases = await indexedDB.databases?.().catch(() => []);
	for (const { name } of databases ?? []) if (name?.startsWith(BRAND_DATA_DB_PREFIX)) indexedDB.deleteDatabase(name);
	await removeBrandDataFiles(true).catch(() => {});
}

export class IncompatibleFormatError extends Error {
	constructor() {
		super("Elmo has been updated. Reload the page to see the latest data.");
	}
}

class ForbiddenError extends Error {
	constructor() {
		super("You no longer have access to this brand.");
	}
}

async function fetchOk(url: string): Promise<Response> {
	const response = await fetch(url, { credentials: "same-origin" });
	if (response.status === 401 || response.status === 403) throw new ForbiddenError();
	if (!response.ok) throw new Error(`Brand data request failed: ${response.status}`);
	return response;
}

let writer: Promise<DuckEngineConnection> | undefined;
let writes: Promise<unknown> = Promise.resolve();

export function setDuckWriter(connection: Promise<DuckEngineConnection>) {
	writer = connection;
}

/** Runs DuckDB writes one at a time, each in a transaction, so reads on other connections never see half a chunk. */
function write(change: (conn: DuckEngineConnection) => Promise<void>): Promise<void> {
	const next = writes.then(async () => {
		if (!writer) throw new Error("DuckDB isn't open");
		const conn = await writer;
		await conn.query("BEGIN TRANSACTION");
		try {
			await change(conn);
			await conn.query("COMMIT");
		} catch (error) {
			await conn.query("ROLLBACK");
			throw error;
		}
	});
	writes = next.catch(() => {});
	return next;
}

const dataUrl = (brandId: string, chunks?: string[]) =>
	`/api/brand-data/${encodeURIComponent(brandId)}${chunks ? `?chunks=${encodeURIComponent(chunks.join(","))}` : ""}`;

const RECENT_DAYS = 31;

/**
 * The order to fetch chunks in: everything the last 30 days needs, from the entities through the pages' text,
 * then each older month, newest first.
 */
export function syncOrder(ids: Iterable<string>, now = new Date()): string[] {
	const recentFrom = new Date(now.getTime() - RECENT_DAYS * 86_400_000).toISOString().slice(0, 7);
	const key = (id: string): [number, string, number] => {
		if (id === ENTITIES_CHUNK) return [0, "", 0];
		if (isPagesChunk(id)) return [2, "", 0];
		if (isUrlsChunk(id)) return [4, "", 0];
		const [group, month] = id.split(":");
		const citations = group === "citations" ? 1 : 0;
		if (month >= recentFrom) return [citations ? 3 : 1, "", 0];
		return [5, month, citations];
	};
	const compare = (a: string, b: string) => {
		const [ka, kb] = [key(a), key(b)];
		return (
			ka[0] - kb[0] || (ka[1] > kb[1] ? -1 : ka[1] < kb[1] ? 1 : 0) || ka[2] - kb[2] || (a < b ? -1 : a > b ? 1 : 0)
		);
	};
	return [...ids].sort(compare);
}

interface Waiter {
	ids: string[];
	resolve: () => void;
	reject: (error: Error) => void;
}

export interface SyncState {
	generation: number;
	nextSyncInSeconds: number | null;
}

type Listener = (brandId: string, state: SyncState) => void;

/** One brand's chunks: seeded from IndexedDB, refreshed from the server, and loaded into DuckDB as they land. */
class BrandSync {
	private readonly versions = new Map<string, string>();
	entities: EntitiesChunk | undefined;
	private manifest: ChunkManifestEntry[] = [];
	private readonly wanted = new Set<string>();
	private readonly waiters = new Set<Waiter>();
	private refreshing: Promise<void> | null = null;
	private failure: Error | null = null;
	private readonly seeded: Promise<void>;
	private state: SyncState = { generation: 0, nextSyncInSeconds: null };

	constructor(
		readonly brandId: string,
		private readonly listener: Listener,
	) {
		this.seeded = this.seed();
	}

	private async seed() {
		let stored: Awaited<ReturnType<typeof storedBrand>> | undefined;
		await write(async (conn) => {
			stored = await storedBrand(conn, this.brandId);
		});
		if (!stored || stored.versions.size === 0) return;
		for (const [id, version] of stored.versions) this.versions.set(id, version);
		this.entities = stored.entities;
		if (stored.manifest) this.manifest = stored.manifest;
		this.publish();
	}

	private async load(chunks: BrandChunk[]) {
		await write(async (conn) => {
			for (const chunk of chunks) await applyChunk(conn, this.brandId, chunk);
			if (chunks.some((chunk) => isPagesChunk(chunk.id) || isUrlsChunk(chunk.id))) await joinPages(conn);
		});
		for (const chunk of chunks) {
			if (chunk.entities) this.entities = chunk.entities;
			this.versions.set(chunk.id, chunk.version);
			this.wanted.delete(chunk.id);
		}
		this.publish();
	}

	coverage(): Coverage {
		return { available: this.available(), loaded: new Set(this.versions.keys()) };
	}

	refresh(): Promise<void> {
		if (this.failure) return Promise.reject(this.failure);
		this.refreshing ??= this.seeded
			.then(() => this.download())
			.catch((error: Error) => {
				if (error instanceof IncompatibleFormatError) this.failure = error;
				if (error instanceof ForbiddenError) forgetBrand(this.brandId, error);
				this.rejectWaiters(error);
				throw error;
			})
			.finally(() => {
				this.refreshing = null;
				this.rejectWaiters(new Error("Brand data is unavailable"));
			});
		return this.refreshing;
	}

	/** Resolves once every one of `ids` the brand has has synced, fetching them ahead of the rest. */
	need(ids: string[]): Promise<void> {
		if (this.failure) return Promise.reject(this.failure);
		for (const id of ids) this.wanted.add(id);
		const ready = new Promise<void>((resolve, reject) => this.waiters.add({ ids, resolve, reject }));
		this.settle();
		if (this.waiters.size > 0) void this.refresh().catch(() => {});
		return ready;
	}

	private async download() {
		const manifest = (await (await fetchOk(dataUrl(this.brandId))).json()) as ChunkManifest;
		if (manifest.format !== BRAND_DATA_FORMAT) throw new IncompatibleFormatError();
		const current = new Set(manifest.chunks.map((entry) => entry.id));
		const removed = [...this.versions.keys()].filter((id) => !current.has(id));
		const coverageChanged =
			removed.length > 0 ||
			manifest.chunks.length !== this.manifest.length ||
			this.manifest.some((e) => !current.has(e.id));
		if (removed.length > 0) {
			await write(async (conn) => {
				for (const id of removed) await removeChunk(conn, this.brandId, id);
			});
			for (const id of removed) this.versions.delete(id);
			if (removed.some((id) => isPagesChunk(id) || isUrlsChunk(id))) await write(joinPages);
		}
		this.manifest = manifest.chunks;
		this.state = { ...this.state, nextSyncInSeconds: manifest.nextSyncInSeconds };
		const stale = new Set(
			manifest.chunks.filter((entry) => this.versions.get(entry.id) !== entry.version).map((entry) => entry.id),
		);
		if (coverageChanged) this.publish();
		else this.listener(this.brandId, this.state);
		const changed = stale.size + removed.length > 0;
		await Promise.all(Array.from({ length: PARALLEL_REQUESTS }, () => this.drain(stale)));
		await write(async (conn) => {
			await storeManifest(conn, this.brandId, this.manifest);
			if (changed) await compactRollups(conn);
		});
	}

	private async drain(stale: Set<string>) {
		for (let batch = this.nextBatch(stale); batch.length > 0; batch = this.nextBatch(stale)) {
			const response = await fetchOk(dataUrl(this.brandId, batch));
			const chunks = decodeChunks(new Uint8Array(await response.arrayBuffer()));
			await this.load(chunks);
		}
	}

	/** The next chunks to fetch; the pages' text goes one chunk at a time, so a view's months never wait long behind it. */
	private nextBatch(stale: Set<string>): string[] {
		const ordered = syncOrder(stale);
		const queue = [...ordered.filter((id) => this.wanted.has(id)), ...ordered.filter((id) => !this.wanted.has(id))];
		const batch = queue.length > 0 && isUrlsChunk(queue[0]) ? queue.slice(0, 1) : queue.slice(0, BATCH_SIZE);
		for (const id of batch) stale.delete(id);
		return batch;
	}

	private available() {
		return new Set([...this.manifest.map((entry) => entry.id), ...this.versions.keys()]);
	}

	private publish() {
		this.state = { ...this.state, generation: this.state.generation + 1 };
		this.listener(this.brandId, this.state);
		this.settle();
	}

	private settle() {
		const available = this.available();
		for (const waiter of this.waiters) {
			if (waiter.ids.every((id) => this.versions.has(id) || !available.has(id))) {
				this.waiters.delete(waiter);
				waiter.resolve();
			}
		}
	}

	private rejectWaiters(error: Error) {
		for (const waiter of this.waiters) waiter.reject(error);
		this.waiters.clear();
	}

	close(error: Error) {
		this.failure = error;
		this.rejectWaiters(error);
	}
}

const syncs = new Map<string, BrandSync>();
let listener: Listener = () => {};

export function setSyncListener(next: Listener) {
	listener = next;
}

/** The brand's sync, most recently used last, so the worker keeps at most `MAX_BRANDS` brands in DuckDB. */
export function brandSync(brandId: string): BrandSync {
	let sync = syncs.get(brandId);
	syncs.delete(brandId);
	if (!sync) {
		for (const evicted of [...syncs.keys()].slice(0, Math.max(0, syncs.size + 1 - MAX_BRANDS))) forgetBrand(evicted);
		sync = new BrandSync(brandId, (id, state) => listener(id, state));
	}
	syncs.set(brandId, sync);
	return sync;
}

export const syncedBrands = {
	entities: (brandId: string) => syncs.get(brandId)?.entities,
	coverage: (brandId: string): Coverage =>
		syncs.get(brandId)?.coverage() ?? { available: new Set([ENTITIES_CHUNK]), loaded: new Set() },
};

/** Drops the brand's copy, to keep at most `MAX_BRANDS` or because the viewer may no longer read it. */
function forgetBrand(brandId: string, error = new Error("Brand data was unloaded")) {
	syncs.get(brandId)?.close(error);
	syncs.delete(brandId);
	void write((conn) => removeBrand(conn, brandId)).catch(() => {});
}

/** Drops every brand, as when the database it was kept in is deleted. */
export function forgetAllBrands() {
	for (const sync of syncs.values()) sync.close(new Error("Brand data was cleared"));
	syncs.clear();
	writer = undefined;
	writes = Promise.resolve();
}

export function syncBrand(brandId: string): Promise<void> {
	return brandSync(brandId).refresh();
}
