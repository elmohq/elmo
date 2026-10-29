import {
	type BrandDataStatus,
	LOCAL_COMPUTATIONS,
	type LocalComputation,
	type WorkerRequest,
	type WorkerResponse,
} from "@/lib/brand-data/worker/protocol";

const NOT_SYNCED: BrandDataStatus = { core: false, citations: false, version: null };

const statuses = new Map<string, BrandDataStatus>();
const listeners = new Set<(brandId: string) => void>();
const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
let nextId = 0;
let worker: Worker | null | undefined;

function getWorker(): Worker | null {
	if (worker !== undefined) return worker;
	if (typeof Worker === "undefined" || typeof indexedDB === "undefined") {
		worker = null;
		return worker;
	}
	worker = new Worker(new URL("./worker/brand-data.worker.ts", import.meta.url), { type: "module" });
	worker.onmessage = ({ data: message }: MessageEvent<WorkerResponse>) => {
		if (message.type === "status") {
			statuses.set(message.brandId, message.status);
			for (const listener of listeners) listener(message.brandId);
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
	getWorker()?.postMessage(request);
}

export function brandDataStatus(brandId: string): BrandDataStatus {
	return statuses.get(brandId) ?? NOT_SYNCED;
}

export function onBrandDataChange(listener: (brandId: string) => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function syncBrandData(brandId: string) {
	send({ type: "sync", brandId });
}

export function canComputeLocally(brandId: string, name: LocalComputation): boolean {
	return brandDataStatus(brandId)[LOCAL_COMPUTATIONS[name]];
}

export function computeLocally<T>(brandId: string, name: LocalComputation, input: unknown): Promise<T> {
	const id = nextId++;
	return new Promise<T>((resolve, reject) => {
		pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
		send({ type: "compute", id, brandId, name, input });
	});
}
