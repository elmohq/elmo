import type { QuoteText } from "@/lib/brand-data/memory-entity-reads";
import { createMemoryReader } from "@/lib/brand-data/memory-reader";
import { MissingChunksError } from "@/lib/brand-data/store";
import { computations } from "@/lib/brand-data/worker/computations";
import type { BrandComputation, WorkerRequest, WorkerResponse } from "@/lib/brand-data/worker/protocol";
import { brandSync, removeOtherFormats, setSyncListener, syncBrand } from "@/lib/brand-data/worker/sync";
import { clearSharedReads } from "@/lib/shared-read";

const MAX_ATTEMPTS = 50;

const post = (message: WorkerResponse) => self.postMessage(message);

const memoryReader = createMemoryReader(async (brandId, runIds) => {
	const response = await fetch(`/api/brand-data/${encodeURIComponent(brandId)}/quotes?runIds=${runIds.join(",")}`, {
		credentials: "same-origin",
	});
	if (!response.ok) throw new Error(`Quote request failed: ${response.status}`);
	return (await response.json()) as QuoteText[];
});

/** Computes from whatever has synced, waiting for the chunks the answer needs that haven't yet. */
async function compute(brandId: string, name: BrandComputation, input: unknown) {
	for (let attempt = 0; ; attempt++) {
		try {
			return await computations[name](memoryReader, input as never);
		} catch (error) {
			if (!(error instanceof MissingChunksError) || attempt >= MAX_ATTEMPTS) throw error;
			await brandSync(brandId).need(error.chunkIds);
		}
	}
}

const generations = new Map<string, number>();
setSyncListener((brandId, state) => {
	if (generations.get(brandId) !== state.generation) clearSharedReads(memoryReader);
	generations.set(brandId, state.generation);
	post({ type: "status", brandId, state });
});

void removeOtherFormats();

self.onmessage = async ({ data: request }: MessageEvent<WorkerRequest>) => {
	if (request.type === "sync") {
		await syncBrand(request.brandId).catch(() => {});
		return;
	}
	try {
		post({ type: "result", id: request.id, value: await compute(request.brandId, request.name, request.input) });
	} catch (error) {
		post({ type: "error", id: request.id, message: error instanceof Error ? error.message : String(error) });
	}
};
