import { promisify } from "node:util";
import { brotliCompress, constants, gzip } from "node:zlib";
import { createFileRoute } from "@tanstack/react-router";
import {
	BRAND_DATA_FORMAT,
	type BrandChunk,
	type ChunkManifest,
	type ChunkManifestEntry,
	type EntitiesChunk,
	encodeChunks,
} from "@/lib/brand-data/chunks";
import { brandVersions, buildChunk, nextSyncInSeconds } from "@/lib/brand-data/chunks.server";
import { authorizedBrand } from "@/routes/api/brand-data/-authorize";

const brotli = promisify(brotliCompress);
const gzipAsync = promisify(gzip);

const MAX_CHUNKS_PER_REQUEST = 12;
const MAX_CACHED_BYTES = 64 * 1024 * 1024;
const MAX_CONCURRENT_BUILDS = 3;

const cached = new Map<string, BrandChunk>();
let cachedBytes = 0;
const building = new Map<string, Promise<BrandChunk>>();

const sizeOf = (chunk: BrandChunk) =>
	Object.values(chunk.tables ?? {}).reduce((sum, bytes) => sum + bytes.byteLength, 0) || 1024;

function remember(key: string, chunk: BrandChunk) {
	const size = sizeOf(chunk);
	if (size > MAX_CACHED_BYTES / 8) return;
	cached.set(key, chunk);
	cachedBytes += size;
	for (const [oldest, value] of cached) {
		if (cachedBytes <= MAX_CACHED_BYTES) break;
		cached.delete(oldest);
		cachedBytes -= sizeOf(value);
	}
}

let active = 0;
const queue: (() => void)[] = [];

async function limited<T>(task: () => Promise<T>): Promise<T> {
	if (active >= MAX_CONCURRENT_BUILDS) await new Promise<void>((resolve) => queue.push(resolve));
	active++;
	try {
		return await task();
	} finally {
		active--;
		queue.shift()?.();
	}
}

/** A chunk, built once per version and shared by every request for it. */
function chunkFor(brandId: string, entry: ChunkManifestEntry, entities: EntitiesChunk): Promise<BrandChunk> {
	const key = `${brandId}|${entry.id}|${entry.version}`;
	const hit = cached.get(key);
	if (hit !== undefined) {
		cached.delete(key);
		cached.set(key, hit);
		return Promise.resolve(hit);
	}
	let pending = building.get(key);
	if (!pending) {
		pending = limited(() => buildChunk(brandId, entry, entities)).then((chunk) => {
			remember(key, chunk);
			return chunk;
		});
		building.set(key, pending);
		void pending.finally(() => building.delete(key)).catch(() => {});
	}
	return pending;
}

async function compressed(body: Uint8Array, acceptEncoding: string | null) {
	if (acceptEncoding?.includes("br")) {
		return { encoding: "br", bytes: await brotli(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }) };
	}
	return { encoding: "gzip", bytes: await gzipAsync(body) };
}

export const Route = createFileRoute("/api/brand-data/$brandId/")({
	server: {
		handlers: {
			GET: async ({ params, request }) => {
				const denied = await authorizedBrand(params.brandId);
				if (denied) return denied;
				const requested = new URL(request.url).searchParams.get("chunks");
				if (!requested) {
					const [{ chunks }, nextSync] = await Promise.all([
						brandVersions(params.brandId),
						nextSyncInSeconds(params.brandId),
					]);
					const body: ChunkManifest = { format: BRAND_DATA_FORMAT, chunks, nextSyncInSeconds: nextSync };
					return Response.json(body, { headers: { "Cache-Control": "no-store" } });
				}
				const ids = new Set(requested.split(",").slice(0, MAX_CHUNKS_PER_REQUEST));
				const { chunks, entities } = await brandVersions(params.brandId);
				const parts = await Promise.all(
					chunks.filter((entry) => ids.has(entry.id)).map((entry) => chunkFor(params.brandId, entry, entities)),
				);
				const { encoding, bytes } = await compressed(encodeChunks(parts), request.headers.get("accept-encoding"));
				return new Response(new Uint8Array(bytes), {
					headers: {
						"Content-Type": "application/octet-stream",
						"Content-Encoding": encoding,
						"Cache-Control": "no-store",
					},
				});
			},
		},
	},
});
