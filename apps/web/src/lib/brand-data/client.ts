import { BRAND_DATA_DB_PREFIX } from "@/lib/brand-data/chunks";
import type { computations } from "@/lib/brand-data/worker/computations";
import type { BrandComputation, Job, WorkerRequest, WorkerResponse } from "@/lib/brand-data/worker/protocol";
import type { SyncState } from "@/lib/brand-data/worker/sync";

type Computations = typeof computations;
export type ComputationInput<K extends BrandComputation> = Parameters<Computations[K]>[1];
export type ComputationResult<K extends BrandComputation> = Awaited<ReturnType<Computations[K]>>;

const TIMEOUT_MS = 60_000;
const CLEAR_TIMEOUT_MS = 3_000;

/** Options for queries answered from synced brand data, which a sync invalidates when it changes the data. */
export const brandDataQuery = { meta: { brandData: true }, staleTime: 5 * 60_000 } as const;

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

function request(job: Job, timeoutMs = TIMEOUT_MS): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const id = nextId++;
		const timer = setTimeout(() => {
			pending.delete(id);
			reject(new Error("Brand data took too long to load"));
		}, timeoutMs);
		pending.set(id, {
			resolve: (value) => {
				clearTimeout(timer);
				resolve(value);
			},
			reject: (error) => {
				clearTimeout(timer);
				reject(error);
			},
		});
		try {
			getWorker().postMessage({ id, job } satisfies WorkerRequest);
		} catch (error) {
			pending.get(id)?.reject(error as Error);
			pending.delete(id);
		}
	});
}

export function onBrandDataChange(listener: (brandId: string, state: SyncState) => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function syncBrandData(brandId: string) {
	void request({ type: "sync", brandId }).catch(() => {});
}

/** Answers from the brand's synced data, waiting for whatever part of it the answer needs. */
export function computeBrandData<K extends BrandComputation>(
	name: K,
	input: ComputationInput<K> & { brandId: string },
): Promise<ComputationResult<K>> {
	return request({ type: "compute", brandId: input.brandId, name, input }) as Promise<ComputationResult<K>>;
}

/** Removes every brand's synced copy from this browser, as when signing out. */
export async function clearBrandData() {
	if (worker) await request({ type: "clear" }, CLEAR_TIMEOUT_MS).catch(() => {});
	stopWorker(new Error("Signed out"));
	const root = await navigator.storage?.getDirectory().catch(() => undefined);
	if (!root) return;
	for await (const name of (root as unknown as { keys(): AsyncIterable<string> }).keys()) {
		if (name.startsWith(BRAND_DATA_DB_PREFIX)) await root.removeEntry(name).catch(() => {});
	}
}
