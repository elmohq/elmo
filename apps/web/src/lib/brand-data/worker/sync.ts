import { type Collection, createCollection } from "@tanstack/db";
import {
	assembleBundle,
	BRAND_DATA_FORMAT,
	type BrandChunk,
	type ChunkManifest,
	type ChunkManifestEntry,
	isCitationChunk,
	manifestVersion,
} from "@/lib/brand-data/chunks";
import { decodeBrandBundle, setBrandStore } from "@/lib/brand-data/store";
import type { BrandDataStatus } from "@/lib/brand-data/worker/protocol";

const SYNC_BATCH = 12;

const DB_PREFIX = "elmo-brand-data";
const DB_NAME = `${DB_PREFIX}-v${BRAND_DATA_FORMAT}`;
const STORE = "chunks";

function idb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const open = indexedDB.open(DB_NAME, 1);
		open.onupgradeneeded = () => open.result.createObjectStore(STORE);
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

export async function removeOtherFormats() {
	const databases = await indexedDB.databases?.().catch(() => []);
	for (const { name } of databases ?? []) {
		if (name?.startsWith(DB_PREFIX) && name !== DB_NAME) indexedDB.deleteDatabase(name);
	}
}

const statuses = new Map<string, BrandDataStatus>();
let onStatus: (brandId: string, status: BrandDataStatus) => void = () => {};

export function setStatusListener(listener: (brandId: string, status: BrandDataStatus) => void) {
	onStatus = listener;
}

export function brandDataStatus(brandId: string): BrandDataStatus {
	return statuses.get(brandId) ?? { core: false, citations: false, version: null };
}

interface BrandSync {
	collection: Collection<BrandChunk, string>;
	run: () => Promise<void>;
}

type Apply = (chunks: BrandChunk[], removed?: string[]) => void;

const syncs = new Map<string, BrandSync>();

const dataUrl = (brandId: string, chunks?: string[]) =>
	`/api/brand-data/${encodeURIComponent(brandId)}${chunks ? `?chunks=${encodeURIComponent(chunks.join(","))}` : ""}`;

async function fetchJson<T>(url: string): Promise<T> {
	const response = await fetch(url, { credentials: "same-origin" });
	if (!response.ok) throw new Error(`Brand data request failed: ${response.status}`);
	return response.json() as Promise<T>;
}

/** The server now writes a format this build cannot read; it keeps answering from the server until reloaded. */
export class IncompatibleFormatError extends Error {
	constructor(format: number) {
		super(`Brand data format ${format} is not ${BRAND_DATA_FORMAT}`);
	}
}

async function syncOnce(brandId: string, held: Collection<BrandChunk, string>, apply: Apply) {
	const { format, chunks: manifest } = await fetchJson<ChunkManifest>(dataUrl(brandId));
	if (format !== BRAND_DATA_FORMAT) throw new IncompatibleFormatError(format);
	const current = new Set(manifest.map((entry) => entry.id));
	const removed = ([...held.keys()] as string[]).filter((id) => !current.has(id));
	const stale = manifest.filter((entry) => held.get(entry.id)?.hash !== entry.hash);
	apply([], removed);
	const ordered = [...stale.filter((e) => !isCitationChunk(e.id)), ...stale.filter((e) => isCitationChunk(e.id))];
	const fetched: BrandChunk[] = [];
	for (let i = 0; i < ordered.length; i += SYNC_BATCH) {
		const ids = ordered.slice(i, i + SYNC_BATCH).map((entry) => entry.id);
		const { chunks } = await fetchJson<{ chunks: BrandChunk[] }>(dataUrl(brandId, ids));
		apply(chunks);
		fetched.push(...chunks);
	}
	void idbWrite(brandId, manifest, fetched, removed).catch(() => {});
	return { manifest, changed: stale.length + removed.length };
}

function brandSync(brandId: string): BrandSync {
	const existing = syncs.get(brandId);
	if (existing) return existing;

	let manifest: ChunkManifestEntry[] = [];
	let runNow: () => Promise<void> = async () => {};

	const collection = createCollection<BrandChunk, string>({
		id: `brand-chunks:v${BRAND_DATA_FORMAT}:${brandId}`,
		getKey: (chunk) => chunk.id,
		startSync: true,
		gcTime: Number.POSITIVE_INFINITY,
		sync: {
			rowUpdateMode: "full",
			sync: ({ begin, write, commit, markReady, collection: held }) => {
				const apply: Apply = (chunks, removed = []) => {
					if (chunks.length === 0 && removed.length === 0) return;
					begin();
					for (const chunk of chunks) write({ type: held.has(chunk.id) ? "update" : "insert", value: chunk });
					for (const old of removed.map((id) => held.get(id)).filter((chunk) => chunk !== undefined)) {
						write({ type: "delete", value: old });
					}
					commit();
				};
				let ready = false;
				const readyOnce = () => {
					if (!ready) markReady();
					ready = true;
				};
				const seeded = idbRead(brandId)
					.catch(() => ({ chunks: [] as BrandChunk[], manifest: undefined }))
					.then((cached) => {
						if (cached.manifest) manifest = cached.manifest;
						apply(cached.chunks);
						if (cached.chunks.length > 0) readyOnce();
					});
				let running: Promise<void> | null = null;
				runNow = () => {
					running ??= seeded
						.then(() => syncOnce(brandId, held, apply))
						.then((result) => {
							manifest = result.manifest;
							readyOnce();
							if (result.changed === 0) publish(brandId, held, manifest);
						})
						.finally(() => {
							running = null;
						});
					return running;
				};
				void runNow().catch(() => {});
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
	for (const evicted of setBrandStore(decodeBrandBundle(bundle))) forget(evicted);
	const status = { core: true, citations, version };
	statuses.set(brandId, status);
	onStatus(brandId, status);
}

/** Drops the brand's synced copy from memory, so its pages ask the server until it syncs again. */
function forget(brandId: string) {
	const sync = syncs.get(brandId);
	syncs.delete(brandId);
	void sync?.collection.cleanup();
	statuses.delete(brandId);
	onStatus(brandId, { core: false, citations: false, version: null });
}

export async function syncBrandData(brandId: string): Promise<void> {
	try {
		await brandSync(brandId).run();
	} catch (error) {
		if (error instanceof IncompatibleFormatError) forget(brandId);
		throw error;
	}
}
