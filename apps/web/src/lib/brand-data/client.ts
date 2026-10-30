import { BRAND_DATA_DB_PREFIX } from "@/lib/brand-data/chunks";
import type { computations } from "@/lib/brand-data/worker/computations";
import type { BrandComputation, WorkerRequest, WorkerResponse } from "@/lib/brand-data/worker/protocol";
import type { SyncState } from "@/lib/brand-data/worker/sync";

type Computations = typeof computations;
export type ComputationInput<K extends BrandComputation> = Parameters<Computations[K]>[1];
export type ComputationResult<K extends BrandComputation> = Awaited<ReturnType<Computations[K]>>;

const TIMEOUT_MS = 60_000;

const listeners = new Set<(brandId: string, state: SyncState) => void>();
const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
let nextId = 0;
let worker: Worker | undefined;

function stopWorker(error: Error) {
	worker?.terminate();
	worker = undefined;
	for (const request of pending.values()) request.reject(error);
	pending.clear();
}

function getWorker(): Worker {
	if (worker) return worker;
	if (typeof Worker === "undefined") throw new Error("Brand data needs a browser");
	worker = new Worker(new URL("./worker/brand-data.worker.ts", import.meta.url), { type: "module" });
	worker.onerror = () => stopWorker(new Error("Brand data stopped unexpectedly. Reload the page to try again."));
	worker.onmessage = ({ data: message }: MessageEvent<WorkerResponse>) => {
		if (message.type === "status") {
			for (const listener of listeners) listener(message.brandId, message.state);
			return;
		}
		const request = pending.get(message.id);
		pending.delete(message.id);
		if (message.type === "result") request?.resolve(message.value);
		else request?.reject(new Error(message.message));
	};
	return worker;
}

function send(request: WorkerRequest) {
	getWorker().postMessage(request);
}

export function onBrandDataChange(listener: (brandId: string, state: SyncState) => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function syncBrandData(brandId: string) {
	send({ type: "sync", brandId });
}

/** Answers from the brand's synced data, waiting for whatever part of it the answer needs. */
export function computeBrandData<K extends BrandComputation>(
	name: K,
	input: ComputationInput<K> & { brandId: string },
): Promise<ComputationResult<K>> {
	return new Promise((resolve, reject) => {
		const id = nextId++;
		const timer = setTimeout(() => {
			pending.delete(id);
			reject(new Error("Brand data took too long to load"));
		}, TIMEOUT_MS);
		pending.set(id, {
			resolve: (value) => {
				clearTimeout(timer);
				resolve(value as ComputationResult<K>);
			},
			reject: (error) => {
				clearTimeout(timer);
				reject(error);
			},
		});
		try {
			send({ type: "compute", id, brandId: input.brandId, name, input });
		} catch (error) {
			pending.get(id)?.reject(error as Error);
			pending.delete(id);
		}
	});
}

/** Removes every brand's synced copy from this browser, as when signing out. */
export async function clearBrandData() {
	stopWorker(new Error("Signed out"));
	const databases = await indexedDB.databases?.().catch(() => []);
	for (const { name } of databases ?? []) {
		if (name?.startsWith(BRAND_DATA_DB_PREFIX)) indexedDB.deleteDatabase(name);
	}
}
