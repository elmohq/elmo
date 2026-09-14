/** A workspace outside the key's reach answers 404, identically to one that
 * does not exist. */
import { createFileRoute } from "@tanstack/react-router";
import { db } from "@workspace/lib/db/db";
import { organization } from "@workspace/lib/db/schema";
import { countOrgBrands } from "@workspace/lib/entitlements";
import { eq } from "drizzle-orm";
import { ApiError, createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { requireOrganizationInScope } from "@/lib/api/scope";

export const Route = createFileRoute("/api/v1/organizations/$organizationId")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				handle: async ({ params, auth }) => {
					const { organizationId } = params;
					requireOrganizationInScope(auth, organizationId);
					const [row] = await db
						.select({
							id: organization.id,
							name: organization.name,
							slug: organization.slug,
							createdAt: organization.createdAt,
						})
						.from(organization)
						.where(eq(organization.id, organizationId))
						.limit(1);
					if (!row) {
						throw new ApiError(404, "Not Found", `Organization "${organizationId}" not found.`);
					}
					return { ...row, brandCount: await countOrgBrands(organizationId) };
				},
			}),
		}),
	},
});
