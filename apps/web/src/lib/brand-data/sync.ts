/**
 * Keeps each brand's data in a TanStack DB collection of chunks. Its sync
 * adapter seeds from IndexedDB so a return visit computes at once, then asks the
 * server for the chunk manifest and fetches only the chunks whose hash changed:
 * core analytics first, the citation long tail after. Every change rebuilds the
 * in-memory store the analytics reads use.
 */
import { type Collection, createCollection } from "@tanstack/db";
import {
	assembleBundle,
	type BrandChunk,
	type ChunkManifestEntry,
	isCitationChunk,
	manifestVersion,
} from "@/lib/brand-data/chunks";
import { decodeBrandBundle, setBrandStore } from "@/lib/brand-data/store";

export interface BrandDataStatus {
	core: boolean;
	citations: boolean;
	version: string | null;
}

const SYNC_BATCH = 12;

const DB_NAME = "elmo-brand-data";
const STORE = "chunks";

function idb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const open = indexedDB.open(DB_NAME, 2);
		open.onupgradeneeded = () => {
			for (const name of [...open.result.objectStoreNames]) open.result.deleteObjectStore(name);
			open.result.createObjectStore(STORE);
		};
		open.onsuccess = () => resolve(open.result);
		open.onerror = () => reject(open.error);
	});
}

async function idbRead(brandId: string): Promise<{ manifest?: ChunkManifestEntry[]; chunks: BrandChunk[] }> {
	const db = await idb();
	return new Promise((resolve, reject) => {
		const request = db
			.transaction(STORE)
			.objectStore(STORE)
			.getAll(IDBKeyRange.bound(`${brandId}|`, `${brandId}|￿`));
		request.onsuccess = () => {
			const values = request.result as ({ manifest: ChunkManifestEntry[] } | BrandChunk)[];
			const manifest = values.find((v): v is { manifest: ChunkManifestEntry[] } => "manifest" in v)?.manifest;
			resolve({ manifest, chunks: values.filter((v): v is BrandChunk => "data" in v) });
		};
		request.onerror = () => reject(request.error);
	});
}

async function idbWrite(brandId: string, manifest: ChunkManifestEntry[], put: BrandChunk[], remove: string[]) {
	const db = await idb();
	return new Promise<void>((resolve, reject) => {
		const tx = db.transaction(STORE, "readwrite");
		const store = tx.objectStore(STORE);
		store.put({ manifest }, `${brandId}|~manifest`);
		for (const chunk of put) store.put(chunk, `${brandId}|${chunk.id}`);
		for (const id of remove) store.delete(`${brandId}|${id}`);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

const statuses = new Map<string, BrandDataStatus>();
const listeners = new Set<(brandId: string) => void>();

export function brandDataStatus(brandId: string): BrandDataStatus {
	return statuses.get(brandId) ?? { core: false, citations: false, version: null };
}

export function onBrandDataChange(listener: (brandId: string) => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

interface BrandSync {
	collection: Collection<BrandChunk, string>;
	run: () => Promise<void>;
}

const syncs = new Map<string, BrandSync>();

function brandSync(brandId: string): BrandSync {
	const existing = syncs.get(brandId);
	if (existing) return existing;

	let manifest: ChunkManifestEntry[] = [];
	let runNow: () => Promise<void> = async () => {};

	const collection = createCollection<BrandChunk, string>({
		id: `brand-chunks:${brandId}`,
		getKey: (chunk) => chunk.id,
		startSync: true,
		gcTime: Number.POSITIVE_INFINITY,
		sync: {
			rowUpdateMode: "full",
			sync: ({ begin, write, commit, markReady, collection: self }) => {
				let ready = false;
				const apply = (chunks: BrandChunk[], removed: string[] = []) => {
					if (chunks.length === 0 && removed.length === 0) return;
					begin();
					for (const chunk of chunks) write({ type: self.has(chunk.id) ? "update" : "insert", value: chunk });
					for (const id of removed) {
						const old = self.get(id);
						if (old) write({ type: "delete", value: old });
					}
					commit();
				};
				const markReadyOnce = () => {
					if (!ready) {
						ready = true;
						markReady();
					}
				};

				let seeded = false;
				let running: Promise<void> | null = null;
				runNow = () => {
					running ??= (async () => {
						if (!seeded) {
							seeded = true;
							const cached = await idbRead(brandId).catch(() => ({ chunks: [] as BrandChunk[], manifest: undefined }));
							if (cached.manifest) manifest = cached.manifest;
							apply(cached.chunks);
							if (cached.chunks.length > 0) markReadyOnce();
						}
						const response = await fetch(`/api/brand-data/${encodeURIComponent(brandId)}`, {
							credentials: "same-origin",
						});
						if (!response.ok) throw new Error(`Brand data manifest failed: ${response.status}`);
						const fresh = ((await response.json()) as { chunks: ChunkManifestEntry[] }).chunks;
						const freshIds = new Set(fresh.map((entry) => entry.id));
						const removed = [...self.keys()].filter((id) => !freshIds.has(id as string)) as string[];
						const stale = fresh.filter((entry) => self.get(entry.id)?.hash !== entry.hash);
						manifest = fresh;
						apply([], removed);
						const ordered = [
							...stale.filter((e) => !isCitationChunk(e.id)),
							...stale.filter((e) => isCitationChunk(e.id)),
						];
						const fetched: BrandChunk[] = [];
						for (let i = 0; i < ordered.length; i += SYNC_BATCH) {
							const ids = ordered.slice(i, i + SYNC_BATCH).map((entry) => entry.id);
							const batch = await fetch(
								`/api/brand-data/${encodeURIComponent(brandId)}?chunks=${encodeURIComponent(ids.join(","))}`,
								{ credentials: "same-origin" },
							);
							if (!batch.ok) throw new Error(`Brand data chunks failed: ${batch.status}`);
							const { chunks } = (await batch.json()) as { chunks: BrandChunk[] };
							apply(chunks);
							fetched.push(...chunks);
						}
						markReadyOnce();
						void idbWrite(brandId, fresh, fetched, removed).catch(() => {});
						if (stale.length === 0 && removed.length === 0) publish(brandId, self, manifest);
					})().finally(() => {
						running = null;
					});
					return running;
				};
				void runNow().catch((error) => console.warn("[brand-data] sync failed", error));
				return () => {};
			},
		},
	});

	let scheduled = false;
	collection.subscribeChanges(() => {
		if (scheduled) return;
		scheduled = true;
		queueMicrotask(() => {
			scheduled = false;
			publish(brandId, collection, manifest);
		});
	});

	const sync: BrandSync = { collection, run: () => runNow() };
	syncs.set(brandId, sync);
	return sync;
}

function publish(brandId: string, collection: Collection<BrandChunk, string>, manifest: ChunkManifestEntry[]) {
	const has = (entry: ChunkManifestEntry) => collection.get(entry.id)?.hash === entry.hash;
	const core = manifest.length > 0 && manifest.filter((e) => !isCitationChunk(e.id)).every(has);
	if (!core) return;
	const citations = manifest.filter((e) => isCitationChunk(e.id)).every(has);
	const version = manifestVersion(manifest);
	const previous = statuses.get(brandId);
	if (previous?.version === version && previous.citations === citations) return;
	const chunks = citations
		? collection.values()
		: [...collection.values()].filter((chunk) => !isCitationChunk(chunk.id));
	const bundle = assembleBundle(brandId, version, chunks);
	if (!bundle) return;
	setBrandStore(decodeBrandBundle(bundle));
	statuses.set(brandId, { core: true, citations, version });
	for (const listener of listeners) listener(brandId);
}

/** Starts the brand's sync if needed and brings it up to date. */
export function syncBrandData(brandId: string): Promise<void> {
	return brandSync(brandId).run();
}
