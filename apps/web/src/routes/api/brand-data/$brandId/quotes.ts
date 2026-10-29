import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { loadQuoteTexts } from "@/lib/brand-data/quote-texts.server";
import { authorizedBrand } from "@/routes/api/brand-data/-authorize";

const runIdsSchema = z.array(z.string().uuid()).min(1).max(50);

export const Route = createFileRoute("/api/brand-data/$brandId/quotes")({
	server: {
		handlers: {
			GET: async ({ params, request }) => {
				const denied = await authorizedBrand(params.brandId);
				if (denied) return denied;
				const runIds = runIdsSchema.safeParse(new URL(request.url).searchParams.get("runIds")?.split(","));
				if (!runIds.success) return Response.json({ error: "Invalid runIds" }, { status: 400 });
				return Response.json(await loadQuoteTexts(params.brandId, runIds.data), {
					headers: { "Cache-Control": "private, max-age=3600" },
				});
			},
		},
	},
});
