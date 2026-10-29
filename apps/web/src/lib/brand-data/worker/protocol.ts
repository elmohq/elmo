export type DataPart = "core" | "citations";

export interface BrandDataStatus {
	core: boolean;
	citations: boolean;
	version: string | null;
}

/** The analytics computed in the worker, and the part of a brand's data each one needs. */
export const LOCAL_COMPUTATIONS = {
	dashboardSummary: "core",
	shareOfVoice: "core",
	landscape: "core",
	brandSentiment: "core",
	batchChartData: "core",
	filteredVisibility: "core",
	promptsSummary: "core",
	queryFanout: "core",
	citations: "citations",
	citationUrls: "citations",
	citationDomains: "citations",
	googleShopping: "citations",
	citationFlow: "citations",
} as const satisfies Record<string, DataPart>;

export type LocalComputation = keyof typeof LOCAL_COMPUTATIONS;

export type WorkerRequest =
	| { type: "sync"; brandId: string }
	| { type: "compute"; id: number; brandId: string; name: LocalComputation; input: unknown };

export type WorkerResponse =
	| { type: "status"; brandId: string; status: BrandDataStatus }
	| { type: "result"; id: number; value: unknown }
	| { type: "error"; id: number; message: string };
