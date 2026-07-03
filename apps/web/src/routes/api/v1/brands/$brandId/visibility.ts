/**
 * /api/v1/brands/:brandId/visibility — brand AI-visibility over a date range.
 *
 * GET  a daily mention-rate series (LVCF smoothed) plus period totals. Backed
 *      by the same `getBrandVisibility` computation as the dashboard, so the
 *      API and the UI never report different numbers.
 *
 * Scoped like the other brand endpoints: out-of-scope or nonexistent brands
 * return an identical 404. A read (GET), so read-only keys may call it.
 */
import { createFileRoute } from "@tanstack/react-router";
import { db } from "@workspace/lib/db/db";
import { brands } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { parseDateRange } from "@/lib/api/analytics-range";
import { ApiError, createApiHandler } from "@/lib/api/handler";
import { canAccessBrand } from "@/lib/api/scope";
import { getBrandVisibility } from "@/server/analytics-core";

// Out-of-scope access must 404 exactly like a nonexistent brand — same
// wording as GET /brands/:brandId — so a key can't probe which brands exist.
function brandNotFound(brandId: string): ApiError {
	return new ApiError(404, "Not Found", `Brand "${brandId}" not found.`);
}

export const Route = createFileRoute("/api/v1/brands/$brandId/visibility")({
	server: {
		handlers: {
			GET: createApiHandler({
				handle: async ({ params, request, auth }) => {
					const { brandId } = params;
					if (!canAccessBrand(auth, brandId)) {
						throw brandNotFound(brandId);
					}
					const brand = await db.query.brands.findFirst({
						where: eq(brands.id, brandId),
						columns: { id: true },
					});
					if (!brand) {
						throw brandNotFound(brandId);
					}

					const { searchParams } = new URL(request.url);
					const range = parseDateRange(searchParams);

					const result = await getBrandVisibility({
						brandId,
						fromDate: range.from,
						toDate: range.to,
						timezone: range.timezone,
						model: searchParams.get("model") || undefined,
						tags: searchParams.get("tags") || undefined,
					});

					return {
						brandId,
						range,
						currentVisibility: result.currentVisibility,
						totalRuns: result.totalRuns,
						totalPrompts: result.totalPrompts,
						totalCitations: result.totalCitations,
						series: result.series,
					};
				},
			}),
		},
	},
});
