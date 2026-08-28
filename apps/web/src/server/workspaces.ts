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
import { brandPath, parseStrandedAppPath, workspacePath } from "@workspace/lib/app-urls";
import { db } from "@workspace/lib/db/db";
import { isOrgSlugAvailable, isValidSlug, MAX_SLUG_LENGTH } from "@workspace/lib/db/provisioning";
import { brands, member, organization } from "@workspace/lib/db/schema";
import { asc, count, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
	findBrandLocation,
	getAuthSession,
	hasReportAccess,
	isAdmin,
	listUserOrganizations,
	requireAuthSession,
	requireOrganization,
	resolveOrganization,
	type UserOrganization,
} from "@/lib/auth/helpers";
import { getDeployment } from "@/lib/config/server";
import type { SlugResult } from "@/lib/slugs";
import { countWorkspaceBrands, decideBrandCreation, withBrands } from "@/lib/workspaces/server";
import type { WorkspaceRouteContext, WorkspaceWithBrands } from "@/lib/workspaces/types";

export type {
	WorkspaceBrand,
	WorkspaceRouteContext,
	WorkspaceSummary,
	WorkspaceWithBrands,
} from "@/lib/workspaces/types";

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
 * `beforeLoad` re-runs on every navigation, filter changes included, so this
 * holds only indexed reads. Whether the workspace can take another brand costs
 * an entitlements lookup and is asked for by the pages that offer creation.
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

/** What the 404 page renders: where the path was going, and where else to go. */
export interface NotFoundContext {
	suggestion: { href: string; name: string } | null;
	workspaces: WorkspaceWithBrands[];
}

/**
 * `/app/$brand/…` was the shape before workspaces were in the URL, and those
 * links are still out there in bookmarks and in whitelabel parent dashboards
 * this deployment doesn't control. Rather than keep a compatibility route alive
 * in the tree forever, the 404 resolves them and offers the way across — which
 * gets the person where they were going and makes the move visible enough that
 * whoever mints those links updates them.
 *
 * Answers for a signed-out caller too, with nothing in it: the 404 is reachable
 * without a session and must not error there.
 */
export const getNotFoundContextFn = createServerFn({ method: "GET" })
	.validator(z.object({ pathname: z.string() }))
	.handler(async ({ data }): Promise<NotFoundContext> => {
		const session = await getAuthSession();
		if (!session) return { suggestion: null, workspaces: [] };

		const [suggestion, workspaces] = await Promise.all([
			resolveStrandedPath(session.user.id, data.pathname),
			listWorkspaces(session.user.id),
		]);
		return { suggestion, workspaces };
	});

async function resolveStrandedPath(userId: string, pathname: string): Promise<{ href: string; name: string } | null> {
	const parsed = parseStrandedAppPath(pathname);
	if (!parsed) return null;

	// Brand first: `/app/$brand` is the shape these links actually have. A
	// workspace answering to the same name is the rarer case and is tried after.
	const location = await findBrandLocation(userId, parsed.candidate);
	if (location) {
		const base = brandPath(location.org, location.brand);
		return { href: parsed.rest ? `${base}/${parsed.rest}` : base, name: location.brand.name };
	}

	const org = await resolveOrganization(userId, parsed.candidate);
	return org ? { href: workspacePath(org), name: org.name } : null;
}

/**
 * Every workspace the user belongs to, each with its brands — what the switcher
 * and the `/app` picker render.
 */
export const listWorkspacesFn = createServerFn({ method: "GET" }).handler(async (): Promise<WorkspaceWithBrands[]> => {
	const session = await requireAuthSession();
	return listWorkspaces(session.user.id);
});

async function listWorkspaces(userId: string): Promise<WorkspaceWithBrands[]> {
	const orgs = await listUserOrganizations(userId);
	if (orgs.length === 0) return [];

	const orgIds = orgs.map((org) => org.id);
	const [rows, canCreate] = await Promise.all([
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
		decideBrandCreation(orgIds),
	]);

	return orgs.map((org) => ({
		...org,
		brands: rows
			.filter((brand) => brand.organizationId === org.id)
			.map(({ id, slug, name, website, onboarded }) => ({ id, slug, name, website, onboarded })),
		canCreateBrand: canCreate.get(org.id) ?? false,
	}));
}

export interface WorkspaceSettings {
	/** Identity only — this page states what the workspace is, not what it holds. */
	workspace: UserOrganization;
	brandCount: number;
	memberCount: number;
	/** Whether this deployment lets the workspace be renamed from here. */
	canRename: boolean;
}

export const getWorkspaceSettingsFn = createServerFn({ method: "GET" })
	.validator(z.object({ org: z.string() }))
	.handler(async ({ data }): Promise<WorkspaceSettings> => {
		const session = await requireAuthSession();
		const workspace = await requireOrganization(session.user.id, data.org);

		const [brandCount, [memberCount]] = await Promise.all([
			countWorkspaceBrands(workspace.id),
			db.select({ value: count() }).from(member).where(eq(member.organizationId, workspace.id)),
		]);

		return {
			workspace,
			brandCount,
			memberCount: memberCount?.value ?? 0,
			canRename: canEditWorkspace(workspace.role),
		};
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
