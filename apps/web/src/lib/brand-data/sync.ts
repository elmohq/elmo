/**
 * Keeps a brand's bundle in the browser: whatever IndexedDB holds is usable at
 * once, then the server is asked for the current version and only a changed
 * bundle is downloaded. Core analytics arrive first; the citation long tail
 * follows.
 */
import type { BrandBundle } from "@/lib/brand-data/bundle";
import { decodeBrandBundle, getBrandStore, setBrandStore } from "@/lib/brand-data/store";

export interface BrandDataStatus {
	core: boolean;
	citations: boolean;
	version: string | null;
}

type CitationsPart = Pick<BrandBundle, "version" | "citations" | "citationPages" | "dicts">;

const DB_NAME = "elmo-brand-data";
const STORE = "bundles";

function idb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const open = indexedDB.open(DB_NAME, 1);
		open.onupgradeneeded = () => open.result.createObjectStore(STORE);
		open.onsuccess = () => resolve(open.result);
		open.onerror = () => reject(open.error);
	});
}

async function idbGet<T>(key: string): Promise<T | undefined> {
	const db = await idb();
	return new Promise((resolve, reject) => {
		const request = db.transaction(STORE).objectStore(STORE).get(key);
		request.onsuccess = () => resolve(request.result as T | undefined);
		request.onerror = () => reject(request.error);
	});
}

async function idbSet(key: string, value: unknown): Promise<void> {
	const db = await idb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE, "readwrite");
		tx.objectStore(STORE).put(value, key);
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

function publish(brandId: string, core: BrandBundle, citations: CitationsPart | undefined) {
	const merged =
		citations && citations.version === core.version
			? { ...core, citations: citations.citations, citationPages: citations.citationPages }
			: core;
	setBrandStore(decodeBrandBundle(merged));
	statuses.set(brandId, { core: true, citations: merged !== core, version: core.version });
	for (const listener of listeners) listener(brandId);
}

const url = (brandId: string, part?: string) =>
	`/api/brand-data/${encodeURIComponent(brandId)}${part ? `?part=${part}` : ""}`;

async function fetchJson<T>(input: string): Promise<T> {
	const response = await fetch(input, { credentials: "same-origin" });
	if (!response.ok) throw new Error(`Brand data request failed: ${response.status}`);
	return response.json() as Promise<T>;
}

const syncing = new Map<string, Promise<void>>();

/** Loads the local copy, then brings it up to date with the server. Safe to call often. */
export function syncBrandData(brandId: string): Promise<void> {
	const running = syncing.get(brandId);
	if (running) return running;
	const run = (async () => {
		const status = brandDataStatus(brandId);
		let core = getBrandStore(brandId)?.bundle;
		let citations: CitationsPart | undefined;
		if (!status.core) {
			[core, citations] = await Promise.all([
				idbGet<BrandBundle>(`${brandId}:core`).catch(() => undefined),
				idbGet<CitationsPart>(`${brandId}:citations`).catch(() => undefined),
			]);
			if (core) publish(brandId, core, citations);
		}
		const { version } = await fetchJson<{ version: string }>(url(brandId));
		if (!core || core.version !== version) {
			core = await fetchJson<BrandBundle>(url(brandId, "core"));
			publish(brandId, core, undefined);
			void idbSet(`${brandId}:core`, core).catch(() => {});
		}
		if (!brandDataStatus(brandId).citations) {
			const fresh = await fetchJson<CitationsPart>(url(brandId, "citations"));
			if (fresh.version === core.version) {
				publish(brandId, core, fresh);
				void idbSet(`${brandId}:citations`, fresh).catch(() => {});
			}
		}
	})().finally(() => syncing.delete(brandId));
	syncing.set(brandId, run);
	return run;
}
