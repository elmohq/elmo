import type { computations } from "@/lib/brand-data/worker/computations";
import type { SyncState } from "@/lib/brand-data/worker/sync";

export type BrandComputation = keyof typeof computations;

export type WorkerRequest =
	| { type: "sync"; brandId: string }
	| { type: "compute"; id: number; brandId: string; name: BrandComputation; input: unknown };

export type WorkerResponse =
	| { type: "status"; brandId: string; state: SyncState }
	| { type: "result"; id: number; value: unknown }
	| { type: "error"; id: number; message: string };
