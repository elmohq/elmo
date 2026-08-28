/**
 * Access is membership: every read resolves the org through the caller's
 * `member` rows, so an unknown workspace and someone else's are one answer.
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
import { INVALID_SLUG, TAKEN_SLUG } from "@/lib/slug-errors";
import { resolveBrandCreation, withBrands } from "@/lib/workspaces/server";
import type { WorkspaceRouteContext, WorkspaceSummary } from "@/lib/workspaces/types";

export type { WorkspaceBrand, WorkspaceRouteContext, WorkspaceSummary } from "@/lib/workspaces/types";

/**
 * Read through the query cache rather than on every navigation, which is what
 * lets the brand allowance be resolved once here instead of again on each page
 * that offers creation.
 */
export const resolveWorkspaceFn = createServerFn({ method: "GET" })
	.validator(z.object({ org: z.string() }))
	// The explicit return type breaks the type-inference cycle between this fn
	// and the route loaders that both consume it and redirect to typed routes.
	.handler(async ({ data }): Promise<WorkspaceRouteContext | null> => {
		const session = await requireAuthSession();
		const org = await resolveOrganization(session.user.id, data.org);
		if (!org) return null;

		return {
			workspace: await withBrands(org),
			isAdmin: isAdmin(session),
			hasReportAccess: hasReportAccess(session),
		};
	});

/**
 * Nothing for a signed-out caller: the 404 is reachable without a session and
 * must not error there.
 */
export const listReachableWorkspacesFn = createServerFn({ method: "GET" }).handler(
	async (): Promise<WorkspaceSummary[]> => {
		const session = await getAuthSession();
		return session ? listWorkspaces(session.user.id) : [];
	},
);

export const listWorkspacesFn = createServerFn({ method: "GET" }).handler(async (): Promise<WorkspaceSummary[]> => {
	const session = await requireAuthSession();
	return listWorkspaces(session.user.id);
});

async function listWorkspaces(userId: string): Promise<WorkspaceSummary[]> {
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
 * Cloud only: local has one workspace per install, whitelabel's arrive from
 * Auth0, demo writes nothing. The new workspace has no plan, so
 * `checkBrandCreate` refuses a brand until it has one — the same answer an
 * existing workspace gets when its plan lapses.
 */
export const createWorkspaceFn = createServerFn({ method: "POST" })
	.validator(z.object({ name: z.string().trim().min(1).max(100) }))
	.handler(async ({ data }): Promise<{ slug: string }> => {
		const session = await requireAuthSession();
		if (!getDeployment().features.canCreateWorkspaces) {
			throw new Error("This deployment does not create workspaces");
		}

		const { slug } = await provisionUmbrellaOrg({ userId: session.user.id, name: data.name });
		return { slug };
	});

/** Only what the route context doesn't already hold. */
export interface WorkspaceSettings {
	/** Whether this deployment lets the workspace be renamed from here. */
	canRename: boolean;
}

export const getWorkspaceSettingsFn = createServerFn({ method: "GET" })
	.validator(z.object({ org: z.string() }))
	.handler(async ({ data }): Promise<WorkspaceSettings> => {
		const session = await requireAuthSession();
		const workspace = await requireOrganization(session.user.id, data.org);
		return { canRename: canEditWorkspace(workspace.role) };
	});

/**
 * Workspace-wide: every member's links and the billing mail's point at the
 * slug, so this is an admin action for the same reason managing the plan is.
 *
 * Whitelabel workspaces are Auth0's records, and demo writes nothing; renaming
 * either here would be a change the source of truth undoes.
 */
function canEditWorkspace(role: string): boolean {
	const deployment = getDeployment();
	return !deployment.features.readOnly && deployment.mode !== "whitelabel" && isOrgAdminRole(role);
}

/**
 * Rename a workspace, move it to a new slug, or both.
 *
 * One call because it is one edit: the form that carries the name carries the
 * slug beside it, and a save that took only half would leave the page telling
 * the customer something that isn't true yet.
 *
 * Slug availability spans slugs *and* ids, because `/app/org/$org` resolves
 * either — a slug matching another workspace's id would make one URL name two
 * of them.
 */
export const updateWorkspaceFn = createServerFn({ method: "POST" })
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
		const workspace = await requireOrganization(session.user.id, data.org);

		if (!isOrgAdminRole(workspace.role)) {
			throw new Error("Only workspace admins can change the workspace name or URL Slug");
		}
		if (!canEditWorkspace(workspace.role)) {
			throw new Error("This workspace cannot be renamed in this deployment");
		}
		if (!isValidSlug(data.slug)) throw new Error(INVALID_SLUG);
		if (!(await isOrgSlugAvailable(data.slug, { excludeOrgId: workspace.id }))) {
			throw new Error(TAKEN_SLUG);
		}

		await db.update(organization).set({ name: data.name, slug: data.slug }).where(eq(organization.id, workspace.id));
		return { slug: data.slug };
	});
