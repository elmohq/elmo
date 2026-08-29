/**
 * Access is membership: every read resolves the org through the caller's
 * `member` rows, so an unknown organization and someone else's are one answer.
 */
import { createServerFn } from "@tanstack/react-start";
import { isOrgAdminRole } from "@workspace/config/roles";
import { isValidSlug, MAX_SLUG_LENGTH } from "@workspace/lib/app-urls";
import { db } from "@workspace/lib/db/db";
import { isOrgSlugAvailable, provisionUmbrellaOrg } from "@workspace/lib/db/provisioning";
import { organization } from "@workspace/lib/db/schema";
import { syncAuth0UserById } from "@workspace/whitelabel/auth-hooks";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getAuthSession, listUserOrganizations, requireAuthSession, requireOrganization } from "@/lib/auth/helpers";
import { getDeployment } from "@/lib/config/server";
import { summarizeOrganizations } from "@/lib/organizations/server";
import type { OrganizationSummary } from "@/lib/organizations/types";
import { INVALID_SLUG, TAKEN_SLUG } from "@/lib/slug-errors";

export type { OrganizationSummary } from "@/lib/organizations/types";

/**
 * Every organization this user can reach, with its brands and its brand
 * allowance — the only organization read there is.
 *
 * The account menu lists all of them on every page, so a per-organization read
 * beside it would fetch a subset of what is already in hand. `/app/org/$org`
 * resolves its segment against this list for the same reason the brand layout
 * resolves its own against the organization's brands: in memory, off one
 * answer, with nothing to drift.
 *
 * Null for a signed-out caller, which an empty list would not distinguish from
 * a signed-in one with nothing in it — the 404 renders outside the layout that
 * resolves a session, so this is where it learns there is one.
 */
export const listOrganizationsFn = createServerFn({ method: "GET" }).handler(
	async (): Promise<OrganizationSummary[] | null> => {
		const session = await getAuthSession();
		return session ? summarizeOrganizations(await listUserOrganizations(session.user.id)) : null;
	},
);

/**
 * Reconcile this user's memberships with Auth0, where those are the record, and
 * report whether anything was re-read — so the caller knows whether what it has
 * cached about them could have moved underneath it.
 *
 * A no-op everywhere else, and never fatal: an incident at the Management API
 * would otherwise take out the one page that lists what a user can reach, when
 * the memberships already in the database are a perfectly good answer.
 *
 * GET, because a read-only deployment refuses by method: this takes no input
 * and has nothing to do there, and a refusal would take the page with it.
 */
export const syncOrganizationMembershipsFn = createServerFn({ method: "GET" }).handler(async (): Promise<boolean> => {
	if (getDeployment().mode !== "whitelabel") return false;

	const session = await requireAuthSession();
	try {
		await syncAuth0UserById(session.user.id);
	} catch (error) {
		console.error("[auth0-sync] Failed to sync user memberships; continuing with cached ones", error);
	}
	return true;
});

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
 * Rename an organization, move it to a new slug, or both.
 *
 * One call because it is one edit: the form that carries the name carries the
 * slug beside it, and a save that took only half would leave the page telling
 * the customer something that isn't true yet.
 *
 * Organization-wide: every member's links and the billing mail's point at the
 * slug, so this is an admin action for the same reason managing the plan is.
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
			/** Absent when only the name changed, so an untouched slug is never re-validated. */
			slug: z.string().trim().toLowerCase().max(MAX_SLUG_LENGTH).optional(),
		}),
	)
	.handler(async ({ data }): Promise<{ slug: string }> => {
		const session = await requireAuthSession();
		const org = await requireOrganization(session.user.id, data.org);

		if (!isOrgAdminRole(org.role)) {
			throw new Error("Only organization admins can change the organization name or URL Slug");
		}
		if (!getDeployment().features.canEditOrganizations) {
			throw new Error("This organization cannot be renamed in this deployment");
		}
		if (data.slug !== undefined) {
			if (!isValidSlug(data.slug)) throw new Error(INVALID_SLUG);
			if (!(await isOrgSlugAvailable(data.slug, { excludeOrgId: org.id }))) {
				throw new Error(TAKEN_SLUG);
			}
		}

		await db
			.update(organization)
			.set({ name: data.name, ...(data.slug !== undefined && { slug: data.slug }) })
			.where(eq(organization.id, org.id));
		return { slug: data.slug ?? org.slug };
	});
