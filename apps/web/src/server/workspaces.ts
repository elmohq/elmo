/**
 * Server functions for workspaces — the customer-facing name for an
 * organization, and the thing `/app/org/$org` names.
 *
 * Access is membership: everything here resolves the org through the caller's
 * `member` rows, so an unknown workspace and someone else's workspace are the
 * same answer.
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
import type { SlugResult } from "@/lib/slugs";
import { resolveBrandCreation, withBrands } from "@/lib/workspaces/server";
import type { WorkspaceRouteContext, WorkspaceSummary } from "@/lib/workspaces/types";

export type { WorkspaceBrand, WorkspaceRouteContext, WorkspaceSummary } from "@/lib/workspaces/types";

/**
 * Everything the `/app/org/$org` layout puts in route context: the workspace the
 * segment names, its brands, and the session facts the rail renders from.
 *
 * The route tree resolves the org here and nowhere else — pages below read it
 * from context instead of asking again, and the brand layout finds its brand in
 * `brands` without a round trip. Server functions still resolve it for
 * themselves, because each is reachable without going through this route and
 * has to authorize on its own.
 *
 * Read through the query cache rather than on every navigation, so a filter
 * change costs nothing and the brand allowance can be resolved here instead of
 * again on each page that offers creation.
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
 * The workspaces a 404 can offer, or nothing for a signed-out caller — the page
 * is reachable without a session and must not error there.
 */
export const listReachableWorkspacesFn = createServerFn({ method: "GET" }).handler(
	async (): Promise<WorkspaceSummary[]> => {
		const session = await getAuthSession();
		return session ? listWorkspaces(session.user.id) : [];
	},
);

/**
 * Every workspace the user belongs to, each with its brands — what the switcher
 * and the `/app` picker render.
 */
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
 * What the settings page needs that the route context doesn't already hold —
 * the workspace itself, its name, its slug and its brands are all resolved by
 * the layout above, so asking again here would be a second round trip for facts
 * already on screen.
 */
/**
 * Create another workspace for the signed-in user, who owns it.
 *
 * Cloud only: local has one workspace per install, whitelabel's arrive from
 * Auth0, and demo writes nothing. A new workspace has no plan, so the first
 * thing it offers is billing — `checkBrandCreate` refuses a brand until then,
 * which is the same answer an existing workspace gets when its plan lapses.
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

/**
 * What the settings page needs that the route context doesn't already hold. The
 * workspace, its name, its slug and its brands are all resolved by the layout
 * above, so asking again here would be a second round trip for facts already on
 * screen.
 */
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
 * Whether this caller may change what the workspace is called, by name or by
 * URL. Both are workspace-wide: every member's links and the billing mail's
 * links point at the slug, so this is an admin action for the same reason
 * managing the plan and the member list is.
 *
 * Whitelabel workspaces are Auth0's records, and demo writes nothing; renaming
 * either here would be a change the source of truth undoes.
 */
function canEditWorkspace(role: string): boolean {
	const deployment = getDeployment();
	return !deployment.features.readOnly && deployment.mode !== "whitelabel" && isOrgAdminRole(role);
}

function assertCanEditWorkspace(role: string): void {
	if (!isOrgAdminRole(role)) throw new Error("Only workspace admins can change the workspace name or URL");
	if (!canEditWorkspace(role)) throw new Error("This workspace cannot be renamed in this deployment");
}

export const renameWorkspaceFn = createServerFn({ method: "POST" })
	// Trimmed here rather than in the handler, so a name of nothing but spaces is
	// rejected instead of stored as an empty one.
	.validator(z.object({ org: z.string(), name: z.string().trim().min(1).max(100) }))
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		const workspace = await requireOrganization(session.user.id, data.org);
		assertCanEditWorkspace(workspace.role);

		await db.update(organization).set({ name: data.name }).where(eq(organization.id, workspace.id));
		return { success: true };
	});

/**
 * Set the workspace's URL segment.
 *
 * Availability spans slugs *and* ids, because `/app/org/$org` resolves either —
 * a slug matching another workspace's id would make one URL name two of them.
 */
export const setWorkspaceSlugFn = createServerFn({ method: "POST" })
	.validator(z.object({ org: z.string(), slug: z.string().trim().toLowerCase().max(MAX_SLUG_LENGTH) }))
	.handler(async ({ data }): Promise<SlugResult> => {
		const session = await requireAuthSession();
		const workspace = await requireOrganization(session.user.id, data.org);
		assertCanEditWorkspace(workspace.role);

		if (!isValidSlug(data.slug)) return { ok: false, error: "invalid" };
		if (!(await isOrgSlugAvailable(data.slug, { excludeOrgId: workspace.id }))) return { ok: false, error: "taken" };

		await db.update(organization).set({ slug: data.slug }).where(eq(organization.id, workspace.id));
		return { ok: true, slug: data.slug };
	});
