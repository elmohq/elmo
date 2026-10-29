import { gzipSync } from "node:zlib";
import { createFileRoute } from "@tanstack/react-router";
import { requireBrandSession } from "@/lib/auth/helpers";
import { brandDataVersion, buildBrandBundle } from "@/lib/brand-data/build-bundle.server";
import type { BrandBundle } from "@/lib/brand-data/bundle";

type Part = "core" | "citations";

/** A brand's bundle split so the analytics pages can start before the citation long tail arrives. */
function split(bundle: BrandBundle): Record<Part, unknown> {
	const { citations, citationPages, ...core } = bundle;
	const empty = { bucket: [], prompt: [], model: [], provider: [], web: [] };
	return {
		core: {
			...core,
			citations: { ...empty, page: [], citations: [], positionSum: [] },
			citationPages: { id: [], url: [], domain: [], title: [], pageType: [], category: [] },
		},
		citations: { version: bundle.version, citations, citationPages, dicts: bundle.dicts },
	};
}

const built = new Map<string, Promise<Record<Part, Buffer>>>();

function compressedParts(brandId: string, version: string) {
	const key = `${brandId}:${version}`;
	let parts = built.get(key);
	if (!parts) {
		parts = buildBrandBundle(brandId).then((bundle) => {
			const { core, citations } = split(bundle);
			return { core: gzipSync(JSON.stringify(core)), citations: gzipSync(JSON.stringify(citations)) };
		});
		for (const old of built.keys()) if (old.startsWith(`${brandId}:`)) built.delete(old);
		built.set(key, parts);
		parts.catch(() => built.delete(key));
	}
	return parts;
}

export const Route = createFileRoute("/api/brand-data/$brandId")({
	server: {
		handlers: {
			GET: async ({ params, request }) => {
				await requireBrandSession(params.brandId);
				const url = new URL(request.url);
				const version = await brandDataVersion(params.brandId);
				const part = url.searchParams.get("part") as Part | null;
				if (!part) return Response.json({ version }, { headers: { "Cache-Control": "no-store" } });
				const parts = await compressedParts(params.brandId, version);
				return new Response(new Uint8Array(parts[part]), {
					headers: {
						"Content-Type": "application/json",
						"Content-Encoding": "gzip",
						"Cache-Control": "private, no-cache",
						"X-Brand-Data-Version": version,
					},
				});
			},
		},
	},
});
