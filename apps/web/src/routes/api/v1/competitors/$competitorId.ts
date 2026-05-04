/**
 * /api/v1/competitors/:competitorId — single competitor resource.
 *
 * GET     fetch one competitor
 * PATCH   update name / domains / aliases (replace semantics on arrays)
 * DELETE  remove the competitor
 *
 * Protected by API key authentication.
 */
import { createFileRoute } from "@tanstack/react-router";
import { db } from "@workspace/lib/db/db";
import { competitors } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { validateApiKeyFromRequest as validateApiKey } from "@/lib/auth/policies";
import { dedupeDomains, dedupeAliases } from "@/server/onboarding";

function isValidUUID(id: string): boolean {
	const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	return uuidRegex.test(id);
}

function getCompetitorIdFromPath(request: Request): string {
	const segments = new URL(request.url).pathname.split("/").filter(Boolean);
	return decodeURIComponent(segments[segments.length - 1] || "");
}

export const Route = createFileRoute("/api/v1/competitors/$competitorId")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				if (!validateApiKey(request)) {
					return Response.json({ error: "Unauthorized", message: "Valid API key required" }, { status: 401 });
				}

				const id = getCompetitorIdFromPath(request);
				if (!isValidUUID(id)) {
					return Response.json(
						{ error: "Validation Error", message: "Invalid competitor ID format" },
						{ status: 400 },
					);
				}

				try {
					const row = await db.query.competitors.findFirst({ where: eq(competitors.id, id) });
					if (!row) {
						return Response.json(
							{ error: "Not Found", message: `Competitor with ID '${id}' not found` },
							{ status: 404 },
						);
					}
					return Response.json(row);
				} catch (err) {
					console.error("[competitors GET one] failed:", err);
					return Response.json({ error: "Internal Server Error" }, { status: 500 });
				}
			},

			PATCH: async ({ request }) => {
				if (!validateApiKey(request)) {
					return Response.json({ error: "Unauthorized", message: "Valid API key required" }, { status: 401 });
				}

				const id = getCompetitorIdFromPath(request);
				if (!isValidUUID(id)) {
					return Response.json(
						{ error: "Validation Error", message: "Invalid competitor ID format" },
						{ status: 400 },
					);
				}

				let body: any;
				try {
					body = await request.json();
				} catch {
					return Response.json(
						{ error: "Validation Error", message: "Request body must be valid JSON" },
						{ status: 400 },
					);
				}

				const existing = await db.query.competitors.findFirst({ where: eq(competitors.id, id) });
				if (!existing) {
					return Response.json(
						{ error: "Not Found", message: `Competitor with ID '${id}' not found` },
						{ status: 404 },
					);
				}

				const { name, domains, aliases } = body ?? {};
				const update: Partial<typeof competitors.$inferInsert> = {};

				if (name !== undefined) {
					if (typeof name !== "string" || !name.trim()) {
						return Response.json(
							{ error: "Validation Error", message: "name must be a non-empty string" },
							{ status: 400 },
						);
					}
					update.name = name.trim();
				}
				if (domains !== undefined) {
					if (!Array.isArray(domains)) {
						return Response.json(
							{ error: "Validation Error", message: "domains must be an array of strings" },
							{ status: 400 },
						);
					}
					update.domains = dedupeDomains(domains as string[]);
				}
				if (aliases !== undefined) {
					if (!Array.isArray(aliases)) {
						return Response.json(
							{ error: "Validation Error", message: "aliases must be an array of strings" },
							{ status: 400 },
						);
					}
					update.aliases = dedupeAliases(aliases as string[]);
				}

				try {
					const [updated] = await db.update(competitors).set(update).where(eq(competitors.id, id)).returning();
					return Response.json(updated);
				} catch (err) {
					console.error("[competitors PATCH] failed:", err);
					const message = err instanceof Error ? err.message : "Failed to update competitor";
					return Response.json({ error: "Internal Server Error", message }, { status: 500 });
				}
			},

			DELETE: async ({ request }) => {
				if (!validateApiKey(request)) {
					return Response.json({ error: "Unauthorized", message: "Valid API key required" }, { status: 401 });
				}

				const id = getCompetitorIdFromPath(request);
				if (!isValidUUID(id)) {
					return Response.json(
						{ error: "Validation Error", message: "Invalid competitor ID format" },
						{ status: 400 },
					);
				}

				try {
					const [deleted] = await db.delete(competitors).where(eq(competitors.id, id)).returning();
					if (!deleted) {
						return Response.json(
							{ error: "Not Found", message: `Competitor with ID '${id}' not found` },
							{ status: 404 },
						);
					}
					return Response.json({ message: "Competitor deleted successfully", data: deleted });
				} catch (err) {
					console.error("[competitors DELETE] failed:", err);
					return Response.json({ error: "Internal Server Error" }, { status: 500 });
				}
			},
		},
	},
});
