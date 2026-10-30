import {
	assembleBundle,
	BRAND_DATA_DB_PREFIX,
	BRAND_DATA_FORMAT,
	type BrandChunk,
	type ChunkManifest,
	type ChunkManifestEntry,
	ENTITIES_CHUNK,
	isPagesChunk,
} from "@/lib/brand-data/chunks";
import { decodeBrandBundle, forgetBrandStore, setBrandStore } from "@/lib/brand-data/store";

const BATCH_SIZE = 3;
const PARALLEL_REQUESTS = 2;

const DB_NAME = `${BRAND_DATA_DB_PREFIX}-v${BRAND_DATA_FORMAT}`;
const STORE = "chunks";
const MANIFEST_KEY = "~manifest";

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const open = indexedDB.open(DB_NAME, 1);
		open.onupgradeneeded = () => open.result.createObjectStore(STORE);
		open.onsuccess = () => resolve(open.result);
		open.onerror = () => reject(open.error);
	});
}

async function transact<T>(
	mode: IDBTransactionMode,
	run: (store: IDBObjectStore) => IDBRequest<T> | undefined,
): Promise<T | undefined> {
	const db = await openDb();
	try {
		return await new Promise<T | undefined>((resolve, reject) => {
			const tx = db.transaction(STORE, mode);
			const request = run(tx.objectStore(STORE));
			tx.oncomplete = () => resolve(request?.result);
			tx.onerror = () => reject(tx.error);
			tx.onabort = () => reject(tx.error);
		});
	} finally {
		db.close();
	}
}

const brandKeys = (brandId: string) => IDBKeyRange.bound(`${brandId}|`, `${brandId}|￿`);

export async function removeOtherFormats() {
	const databases = await indexedDB.databases?.().catch(() => []);
	for (const { name } of databases ?? []) {
		if (name?.startsWith(BRAND_DATA_DB_PREFIX) && name !== DB_NAME) indexedDB.deleteDatabase(name);
	}
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

async function fetchJson<T>(url: string): Promise<T> {
	const response = await fetch(url, { credentials: "same-origin" });
	if (response.status === 401 || response.status === 403) throw new ForbiddenError();
	if (!response.ok) throw new Error(`Brand data request failed: ${response.status}`);
	return response.json() as Promise<T>;
}

const dataUrl = (brandId: string, chunks?: string[]) =>
	`/api/brand-data/${encodeURIComponent(brandId)}${chunks ? `?chunks=${encodeURIComponent(chunks.join(","))}` : ""}`;

/** Entities first, then this month's runs back to the oldest, then cited pages, then citations. */
function rank(id: string) {
	if (id === ENTITIES_CHUNK) return 0;
	if (id.startsWith("runs:")) return 1;
	return isPagesChunk(id) ? 2 : 3;
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

/** One brand's chunks: seeded from IndexedDB, refreshed from the server, and published to the store as they land. */
class BrandSync {
	private readonly chunks = new Map<string, BrandChunk>();
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
		const cached = await transact("readonly", (store) => store.getAll(brandKeys(this.brandId))).catch(() => []);
		for (const value of (cached ?? []) as ({ manifest: ChunkManifestEntry[] } | BrandChunk)[]) {
			if ("manifest" in value) this.manifest = value.manifest;
			else this.chunks.set(value.id, value);
		}
		if (this.chunks.size > 0) this.publish();
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
		const manifest = await fetchJson<ChunkManifest>(dataUrl(this.brandId));
		if (manifest.format !== BRAND_DATA_FORMAT) throw new IncompatibleFormatError();
		const current = new Set(manifest.chunks.map((entry) => entry.id));
		const removed = [...this.chunks.keys()].filter((id) => !current.has(id));
		const coverageChanged =
			removed.length > 0 ||
			manifest.chunks.length !== this.manifest.length ||
			this.manifest.some((e) => !current.has(e.id));
		for (const id of removed) this.chunks.delete(id);
		this.manifest = manifest.chunks;
		this.state = { ...this.state, nextSyncInSeconds: manifest.nextSyncInSeconds };
		const stale = new Set(
			manifest.chunks.filter((entry) => this.chunks.get(entry.id)?.version !== entry.version).map((entry) => entry.id),
		);
		if (coverageChanged) this.publish();
		else this.listener(this.brandId, this.state);
		if (removed.length > 0) {
			void transact("readwrite", (store) => {
				for (const id of removed) store.delete(`${this.brandId}|${id}`);
				return undefined;
			}).catch(() => {});
		}
		await Promise.all(Array.from({ length: PARALLEL_REQUESTS }, () => this.drain(stale)));
		void transact("readwrite", (store) =>
			store.put({ manifest: this.manifest }, `${this.brandId}|${MANIFEST_KEY}`),
		).catch(() => {});
	}

	private async drain(stale: Set<string>) {
		for (let batch = this.nextBatch(stale); batch.length > 0; batch = this.nextBatch(stale)) {
			const { chunks } = await fetchJson<{ chunks: BrandChunk[] }>(dataUrl(this.brandId, batch));
			for (const chunk of chunks) {
				this.chunks.set(chunk.id, chunk);
				this.wanted.delete(chunk.id);
			}
			this.publish();
			void transact("readwrite", (store) => {
				for (const chunk of chunks) store.put(chunk, `${this.brandId}|${chunk.id}`);
				return undefined;
			}).catch(() => {});
		}
	}

	private nextBatch(stale: Set<string>): string[] {
		const batch = [...stale]
			.sort(
				(a, b) =>
					Number(this.wanted.has(b)) - Number(this.wanted.has(a)) || rank(a) - rank(b) || (a < b ? 1 : a > b ? -1 : 0),
			)
			.slice(0, BATCH_SIZE);
		for (const id of batch) stale.delete(id);
		return batch;
	}

	private available() {
		return new Set([...this.manifest.map((entry) => entry.id), ...this.chunks.keys()]);
	}

	private publish() {
		const bundle = assembleBundle(this.brandId, this.chunks.values());
		if (bundle) {
			const coverage = { available: this.available(), loaded: new Set(this.chunks.keys()) };
			for (const evicted of setBrandStore(decodeBrandBundle(bundle, coverage))) forgetBrand(evicted);
			this.state = { ...this.state, generation: this.state.generation + 1 };
			this.listener(this.brandId, this.state);
		}
		this.settle();
	}

	private settle() {
		const available = this.available();
		for (const waiter of this.waiters) {
			if (waiter.ids.every((id) => this.chunks.has(id) || !available.has(id))) {
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

export function brandSync(brandId: string): BrandSync {
	let sync = syncs.get(brandId);
	if (!sync) {
		sync = new BrandSync(brandId, (id, state) => listener(id, state));
		syncs.set(brandId, sync);
	}
	return sync;
}

/** Drops the brand's copy from memory, and from IndexedDB too when the viewer may no longer read it. */
function forgetBrand(brandId: string, error = new Error("Brand data was unloaded")) {
	syncs.get(brandId)?.close(error);
	syncs.delete(brandId);
	forgetBrandStore(brandId);
	if (error instanceof ForbiddenError) {
		void transact("readwrite", (store) => {
			store.delete(brandKeys(brandId));
			return undefined;
		}).catch(() => {});
	}
}

export function syncBrand(brandId: string): Promise<void> {
	return brandSync(brandId).refresh();
}
