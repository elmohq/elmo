import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { createFileRoute } from "@tanstack/react-router";
import { BRAND_DATA_FORMAT, type BrandChunk, type ChunkManifest } from "@/lib/brand-data/chunks";
import { buildChunks, chunkManifest } from "@/lib/brand-data/chunks.server";
import { authorizedBrand } from "@/routes/api/brand-data/-authorize";

const MAX_CACHED_CHUNKS = 2_000;
const built = new Map<string, Promise<BrandChunk>>();

function cachedChunks(brandId: string, wanted: { id: string; hash: string }[]) {
	const missing = wanted.filter(({ id, hash }) => !built.has(`${brandId}|${id}|${hash}`));
	if (missing.length > 0) {
		const building = buildChunks(brandId, missing);
		missing.forEach(({ id, hash }, i) => {
			const key = `${brandId}|${id}|${hash}`;
			if (built.size >= MAX_CACHED_CHUNKS) built.delete(built.keys().next().value as string);
			const chunk = building.then((chunks) => chunks[i]);
			chunk.catch(() => built.delete(key));
			built.set(key, chunk);
		});
	}
	return Promise.all(wanted.map(({ id, hash }) => built.get(`${brandId}|${id}|${hash}`) as Promise<BrandChunk>));
}

export const Route = createFileRoute("/api/brand-data/$brandId/")({
	server: {
		handlers: {
			GET: async ({ params, request }) => {
				const denied = await authorizedBrand(params.brandId);
				if (denied) return denied;
				const manifest = await chunkManifest(params.brandId);
				const requested = new URL(request.url).searchParams.get("chunks");
				if (!requested) {
					const body: ChunkManifest = { format: BRAND_DATA_FORMAT, chunks: manifest };
					return Response.json(body, { headers: { "Cache-Control": "no-store" } });
				}
				const ids = new Set(requested.split(","));
				const chunks = await cachedChunks(
					params.brandId,
					manifest.filter((entry) => ids.has(entry.id)),
				);
				const body = JSON.stringify({ chunks });
				const brotli = request.headers.get("accept-encoding")?.includes("br");
				const encoded = brotli
					? brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } })
					: gzipSync(body);
				return new Response(new Uint8Array(encoded), {
					headers: {
						"Content-Type": "application/json",
						"Content-Encoding": brotli ? "br" : "gzip",
						"Cache-Control": "no-store",
					},
				});
			},
		},
	},
});
