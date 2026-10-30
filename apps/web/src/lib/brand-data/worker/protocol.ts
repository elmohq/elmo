import type { computations } from "@/lib/brand-data/worker/computations";
import type { SyncState } from "@/lib/brand-data/worker/sync";

export type BrandComputation = keyof typeof computations;

/** Work one tab's engine does for any tab. */
export type Job =
	| { type: "sync"; brandId: string }
	| { type: "compute"; brandId: string; name: BrandComputation; input: unknown }
	| { type: "clear" };

export type WorkerRequest = { id: number; job: Job };

export type WorkerResponse =
	| { type: "status"; brandId: string; state: SyncState }
	| { type: "result"; id: number; value: unknown }
	| { type: "error"; id: number; message: string };
