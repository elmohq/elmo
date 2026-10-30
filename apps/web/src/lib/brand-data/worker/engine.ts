import type { AnalyticsReader } from "@/lib/analytics/reader";
import { isUrlsChunk } from "@/lib/brand-data/chunks";
import { MissingChunksError } from "@/lib/brand-data/coverage";
import { openDuck, removeBrandDataFiles } from "@/lib/brand-data/duck/browser";
import { duckQuery } from "@/lib/brand-data/duck/query";
import { createDuckReader, type QuoteText } from "@/lib/brand-data/duck/reader";
import { computations } from "@/lib/brand-data/worker/computations";
import type { Job } from "@/lib/brand-data/worker/protocol";
import {
	brandSync,
	forgetAllBrands,
	removeOtherFormats,
	type SyncState,
	setDuckWriter,
	setSyncListener,
	syncBrand,
	syncedBrands,
} from "@/lib/brand-data/worker/sync";

const MAX_ATTEMPTS = 50;

const loadQuoteTexts = async (brandId: string, runIds: string[]) => {
	const response = await fetch(`/api/brand-data/${encodeURIComponent(brandId)}/quotes?runIds=${runIds.join(",")}`, {
		credentials: "same-origin",
	});
	if (!response.ok) throw new Error(`Quote request failed: ${response.status}`);
	return (await response.json()) as QuoteText[];
};

/** A query naming a page's URL or title waits for the pages' text, which syncs last. */
const pageTextCheck = (brandId: string) => (text: string) => {
	const { available, loaded } = syncedBrands.coverage(brandId);
	const missing = [...available].filter((id) => isUrlsChunk(id) && !loaded.has(id));
	if (missing.length > 0 && /\b(url|title)\b/.test(text)) throw new MissingChunksError(missing);
};

/** Opens DuckDB on first use and answers every job against it; one tab's engine serves them all. */
export function createEngine(onStatus: (brandId: string, state: SyncState) => void) {
	let duck: ReturnType<typeof openDuck> | undefined;
	let readerConnection: Promise<Awaited<ReturnType<Awaited<ReturnType<typeof openDuck>>["connect"]>>> | undefined;
	let reader: Promise<AnalyticsReader> | null = null;
	const generations = new Map<string, number>();

	const open = () => {
		if (!duck) {
			duck = openDuck();
			setDuckWriter(duck.then((db) => db.connect()));
			readerConnection = duck.then((db) => db.connect());
			void removeOtherFormats();
		}
		return duck;
	};
	const currentReader = () => {
		open();
		reader ??= (readerConnection as NonNullable<typeof readerConnection>).then((conn) =>
			createDuckReader((brandId) => duckQuery(conn, pageTextCheck(brandId)), syncedBrands, loadQuoteTexts),
		);
		return reader;
	};

	setSyncListener((brandId, state) => {
		if (generations.get(brandId) !== state.generation) reader = null;
		generations.set(brandId, state.generation);
		onStatus(brandId, state);
	});

	/** Computes from whatever has synced, waiting for the chunks the answer needs that haven't yet. */
	async function compute(brandId: string, name: Extract<Job, { type: "compute" }>["name"], input: unknown) {
		for (let attempt = 0; ; attempt++) {
			try {
				return await computations[name](await currentReader(), input as never);
			} catch (error) {
				if (!(error instanceof MissingChunksError) || attempt >= MAX_ATTEMPTS) throw error;
				await brandSync(brandId).need(error.chunkIds);
			}
		}
	}

	return async function run(job: Job): Promise<unknown> {
		if (job.type === "compute") return compute(job.brandId, job.name, job.input);
		if (job.type === "sync") {
			open();
			return syncBrand(job.brandId).catch(() => {});
		}
		const db = duck;
		duck = undefined;
		readerConnection = undefined;
		reader = null;
		forgetAllBrands();
		await (await db)?.terminate();
		await removeBrandDataFiles(false);
	};
}
