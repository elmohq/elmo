/**
 * Access is membership: every read resolves the org through the caller's
 * `member` rows, so an unknown organization and someone else's are one answer.
 */
import { createServerFn } from "@tanstack/react-start";
import { isOrgAdminRole } from "@workspace/config/roles";
import { db } from "@workspace/lib/db/db";
import { isOrgSlugAvailable, isValidSlug, MAX_SLUG_LENGTH, provisionUmbrellaOrg } from "@workspace/lib/db/provisioning";
import { brands, organization } from "@workspace/lib/db/schema";
import { asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
	getAuthSession,
	hasReportAccess,
	isAdmin,
	listUserOrganizations,
	requireAuthSession,
	requireOrganization,
	resolveOrganization,
} from "@/lib/auth/helpers";
import { getDeployment } from "@/lib/config/server";
import { resolveBrandCreation, withBrands } from "@/lib/organizations/server";
import type { OrganizationRouteContext, OrganizationSummary } from "@/lib/organizations/types";
import { INVALID_SLUG, TAKEN_SLUG } from "@/lib/slug-errors";

export type { OrganizationRouteContext, OrganizationSummary } from "@/lib/organizations/types";

/**
 * Read through the query cache rather than on every navigation, which is what
 * lets the brand allowance be resolved once here instead of again on each page
 * that offers creation.
 */
export const resolveOrganizationFn = createServerFn({ method: "GET" })
	.validator(z.object({ org: z.string() }))
	// The explicit return type breaks the type-inference cycle between this fn
	// and the route loaders that both consume it and redirect to typed routes.
	.handler(async ({ data }): Promise<OrganizationRouteContext | null> => {
		const session = await requireAuthSession();
		const org = await resolveOrganization(session.user.id, data.org);
		if (!org) return null;

		return {
			organization: await withBrands(org),
			isAdmin: isAdmin(session),
			hasReportAccess: hasReportAccess(session),
		};
	});

/**
 * Null for a signed-out caller, which an empty list would not distinguish from
 * a signed-in one with nothing in it. The 404 renders outside the layout that
 * resolves a session, so this is where it learns there is one.
 */
export const listReachableOrganizationsFn = createServerFn({ method: "GET" }).handler(
	async (): Promise<OrganizationSummary[] | null> => {
		const session = await getAuthSession();
		return session ? listOrganizations(session.user.id) : null;
	},
);

export const listOrganizationsFn = createServerFn({ method: "GET" }).handler(
	async (): Promise<OrganizationSummary[]> => {
		const session = await requireAuthSession();
		return listOrganizations(session.user.id);
	},
);

async function listOrganizations(userId: string): Promise<OrganizationSummary[]> {
	const orgs = await listUserOrganizations(userId);
	if (orgs.length === 0) return [];

	const orgIds = orgs.map((org) => org.id);
	const [rows, creation] = await Promise.all([
		db
			.select({
				id: brands.id,
				slug: brands.slug,
				name: brands.name,
				website: brands.website,
				onboarded: brands.onboarded,
				organizationId: brands.organizationId,
			})
			.from(brands)
			.where(inArray(brands.organizationId, orgIds))
			.orderBy(asc(brands.name)),
		resolveBrandCreation(orgIds),
	]);

	return orgs.map((org) => ({
		id: org.id,
		slug: org.slug,
		name: org.name,
		brands: rows
			.filter((brand) => brand.organizationId === org.id)
			.map(({ id, slug, name, website, onboarded }) => ({ id, slug, name, website, onboarded })),
		...(creation.get(org.id) ?? { canCreateBrand: false, brandLimit: null }),
	}));
}

/**
 * Cloud only: local has one organization per install, whitelabel's arrive from
 * Auth0, demo writes nothing. The new organization has no plan, so
 * `checkBrandCreate` refuses a brand until it has one — the same answer an
 * existing organization gets when its plan lapses.
 */
export const createOrganizationFn = createServerFn({ method: "POST" })
	.validator(z.object({ name: z.string().trim().min(1).max(100) }))
	.handler(async ({ data }): Promise<{ slug: string }> => {
		const session = await requireAuthSession();
		if (!getDeployment().features.canCreateOrganizations) {
			throw new Error("This deployment does not create organizations");
		}

		const { slug } = await provisionUmbrellaOrg({ userId: session.user.id, name: data.name });
		return { slug };
	});

/**
 * Organization-wide: every member's links and the billing mail's point at the
 * slug, so this is an admin action for the same reason managing the plan is.
 *
 * Whitelabel organizations are Auth0's records, and demo writes nothing; renaming
 * either here would be a change the source of truth undoes.
 */
function canEditOrganization(role: string): boolean {
	const deployment = getDeployment();
	return !deployment.features.readOnly && deployment.mode !== "whitelabel" && isOrgAdminRole(role);
}

/**
 * Rename an organization, move it to a new slug, or both.
 *
 * One call because it is one edit: the form that carries the name carries the
 * slug beside it, and a save that took only half would leave the page telling
 * the customer something that isn't true yet.
 *
 * Slug availability spans slugs *and* ids, because `/app/org/$org` resolves
 * either — a slug matching another organization's id would make one URL name two
 * of them.
 */
export const updateOrganizationFn = createServerFn({ method: "POST" })
	// Trimmed here rather than in the handler, so a name of nothing but spaces is
	// rejected instead of stored as an empty one.
	.validator(
		z.object({
			org: z.string(),
			name: z.string().trim().min(1).max(100),
			slug: z.string().trim().toLowerCase().max(MAX_SLUG_LENGTH),
		}),
	)
	.handler(async ({ data }): Promise<{ slug: string }> => {
		const session = await requireAuthSession();
		const org = await requireOrganization(session.user.id, data.org);

		if (!isOrgAdminRole(org.role)) {
			throw new Error("Only organization admins can change the organization name or URL Slug");
		}
		if (!canEditOrganization(org.role)) {
			throw new Error("This organization cannot be renamed in this deployment");
		}
		if (!isValidSlug(data.slug)) throw new Error(INVALID_SLUG);
		if (!(await isOrgSlugAvailable(data.slug, { excludeOrgId: org.id }))) {
			throw new Error(TAKEN_SLUG);
		}

		await db.update(organization).set({ name: data.name, slug: data.slug }).where(eq(organization.id, org.id));
		return { slug: data.slug };
	});
