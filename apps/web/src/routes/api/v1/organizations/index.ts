/**
 * Needs no scope: a key only ever sees the organization it is bound to, and
 * gating this would stop an analytics-only key naming the workspace its own
 * numbers belong to.
 */
import { createFileRoute } from "@tanstack/react-router";
import { db } from "@workspace/lib/db/db";
import { organization } from "@workspace/lib/db/schema";
import { countBrandsByOrg } from "@workspace/lib/entitlements";
import { count } from "drizzle-orm";
import { z } from "zod";
import { createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { offsetOf, paginationOf, paging } from "@/lib/api/query";
import { organizationListSchema } from "@/lib/api/schemas/organizations";
import { organizationScopeCondition } from "@/lib/api/scope";

export const Route = createFileRoute("/api/v1/organizations/")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				response: organizationListSchema,
				query: z.object(paging),
				handle: async ({ query, auth }) => {
					const where = organizationScopeCondition(auth, organization.id);

					const [totals] = await db.select({ count: count() }).from(organization).where(where);
					const total = totals?.count ?? 0;

					const rows = await db
						.select({
							id: organization.id,
							name: organization.name,
							slug: organization.slug,
							createdAt: organization.createdAt,
						})
						.from(organization)
						.where(where)
						.orderBy(organization.createdAt, organization.id)
						.limit(query.limit)
						.offset(offsetOf(query));

					const brandCounts = await countBrandsByOrg(rows.map((row) => row.id));

					return {
						data: rows.map((row) => ({ ...row, brandCount: brandCounts.get(row.id) ?? 0 })),
						pagination: paginationOf(query, total),
					};
				},
			}),
		}),
	},
});
