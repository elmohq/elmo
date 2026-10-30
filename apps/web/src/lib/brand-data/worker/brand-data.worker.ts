import type { AnalyticsReader } from "@/lib/analytics/reader";
import { isUrlsChunk } from "@/lib/brand-data/chunks";
import { MissingChunksError } from "@/lib/brand-data/coverage";
import { openDuck } from "@/lib/brand-data/duck/browser";
import { duckQuery } from "@/lib/brand-data/duck/query";
import { createDuckReader, type QuoteText } from "@/lib/brand-data/duck/reader";
import { computations } from "@/lib/brand-data/worker/computations";
import type { BrandComputation, WorkerRequest, WorkerResponse } from "@/lib/brand-data/worker/protocol";
import {
	brandSync,
	removeOtherFormats,
	setDuckWriter,
	setSyncListener,
	syncBrand,
	syncedBrands,
} from "@/lib/brand-data/worker/sync";

const MAX_ATTEMPTS = 50;

const post = (message: WorkerResponse) => self.postMessage(message);

const loadQuoteTexts = async (brandId: string, runIds: string[]) => {
	const response = await fetch(`/api/brand-data/${encodeURIComponent(brandId)}/quotes?runIds=${runIds.join(",")}`, {
		credentials: "same-origin",
	});
	if (!response.ok) throw new Error(`Quote request failed: ${response.status}`);
	return (await response.json()) as QuoteText[];
};

const duck = openDuck();
setDuckWriter(duck.then((db) => db.connect()));
const readerConnection = duck.then((db) => db.connect());

/** A query naming a page's URL or title waits for the pages' text, which syncs last. */
const pageTextCheck = (brandId: string) => (text: string) => {
	const { available, loaded } = syncedBrands.coverage(brandId);
	const missing = [...available].filter((id) => isUrlsChunk(id) && !loaded.has(id));
	if (missing.length > 0 && /\b(url|title)\b/.test(text)) throw new MissingChunksError(missing);
};

let reader: Promise<AnalyticsReader> | null = null;
const currentReader = () => {
	reader ??= readerConnection.then((conn) =>
		createDuckReader((brandId) => duckQuery(conn, pageTextCheck(brandId)), syncedBrands, loadQuoteTexts),
	);
	return reader;
};

/** Computes from whatever has synced, waiting for the chunks the answer needs that haven't yet. */
async function compute(brandId: string, name: BrandComputation, input: unknown) {
	for (let attempt = 0; ; attempt++) {
		try {
			return await computations[name](await currentReader(), input as never);
		} catch (error) {
			if (!(error instanceof MissingChunksError) || attempt >= MAX_ATTEMPTS) throw error;
			await brandSync(brandId).need(error.chunkIds);
		}
	}
}

const generations = new Map<string, number>();
setSyncListener((brandId, state) => {
	if (generations.get(brandId) !== state.generation) reader = null;
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
