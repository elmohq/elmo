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
import { isOrgSlugAvailable, isValidSlug, MAX_SLUG_LENGTH } from "@workspace/lib/db/provisioning";
import { brands, member, organization } from "@workspace/lib/db/schema";
import { asc, count, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
	findBrandLocation,
	getAuthSession,
	listUserOrganizations,
	requireAuthSession,
	requireOrganization,
	resolveBrandInOrg,
	resolveOrganization,
} from "@/lib/auth/helpers";
import { getDeployment } from "@/lib/config/server";
import { brandPath, parseStrandedAppPath, workspacePath } from "@/lib/workspaces/paths";
import { decideBrandCreation } from "@/lib/workspaces/server";
import type { Workspace, WorkspaceWithBrands } from "@/lib/workspaces/types";

export type { Workspace, WorkspaceBrand, WorkspaceWithBrands } from "@/lib/workspaces/types";

export const resolveWorkspaceFn = createServerFn({ method: "GET" })
	.validator(z.object({ org: z.string() }))
	// The explicit return type breaks the type-inference cycle between this fn
	// and the route loaders that both consume it and redirect to typed routes.
	.handler(async ({ data }): Promise<Workspace | null> => {
		const session = await requireAuthSession();
		return resolveOrganization(session.user.id, data.org);
	});

/**
 * The brand an `/app/org/$org/brand/$brand` segment names, by slug or by id.
 *
 * Resolved once in the layout and handed down as context, so no page below has
 * to know which of the two the URL happens to carry. Membership is re-checked
 * here rather than trusted from the caller: a server function is reachable on
 * its own, not only through the route that normally calls it.
 */
export const resolveBrandFn = createServerFn({ method: "GET" })
	.validator(z.object({ org: z.string(), brand: z.string() }))
	.handler(async ({ data }): Promise<{ id: string; slug: string | null } | null> => {
		const session = await requireAuthSession();
		const workspace = await requireOrganization(session.user.id, data.org);
		return resolveBrandInOrg(workspace.id, data.brand);
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
			.map(({ id, slug, name, onboarded }) => ({ id, slug, name, onboarded })),
		canCreateBrand: canCreate.get(org.id) ?? false,
	}));
}

export interface WorkspaceSettings {
	workspace: Workspace;
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

		const [[brandCount], [memberCount]] = await Promise.all([
			db.select({ value: count() }).from(brands).where(eq(brands.organizationId, workspace.id)),
			db.select({ value: count() }).from(member).where(eq(member.organizationId, workspace.id)),
		]);

		return {
			workspace,
			brandCount: brandCount?.value ?? 0,
			memberCount: memberCount?.value ?? 0,
			// Whitelabel workspaces are Auth0's records, and demo writes nothing;
			// renaming either here would be a change the source of truth undoes.
			canRename: canRenameWorkspace() && isOrgAdminRole(workspace.role),
		};
	});

function canRenameWorkspace(): boolean {
	const deployment = getDeployment();
	return !deployment.features.readOnly && deployment.mode !== "whitelabel";
}

export const renameWorkspaceFn = createServerFn({ method: "POST" })
	// Trimmed here rather than in the handler, so a name of nothing but spaces is
	// rejected instead of stored as an empty one.
	.validator(z.object({ org: z.string(), name: z.string().trim().min(1).max(100) }))
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		const workspace = await requireOrganization(session.user.id, data.org);

		if (!canRenameWorkspace()) throw new Error("This workspace cannot be renamed in this deployment");
		if (!isOrgAdminRole(workspace.role)) throw new Error("Only admins can rename the workspace");

		await db.update(organization).set({ name: data.name }).where(eq(organization.id, workspace.id));
		return { success: true };
	});

export interface WorkspaceSlugResult {
	ok: boolean;
	/** Why the slug was refused, for the field to say so without a thrown error. */
	error?: "invalid" | "taken";
	slug?: string;
}

/**
 * Set the workspace's URL segment.
 *
 * Availability spans slugs *and* ids, because `/app/org/$org` resolves either —
 * a slug matching another workspace's id would make one URL name two of them.
 */
export const setWorkspaceSlugFn = createServerFn({ method: "POST" })
	.validator(z.object({ org: z.string(), slug: z.string().trim().toLowerCase().max(MAX_SLUG_LENGTH) }))
	.handler(async ({ data }): Promise<WorkspaceSlugResult> => {
		const session = await requireAuthSession();
		const workspace = await requireOrganization(session.user.id, data.org);

		if (!canRenameWorkspace()) throw new Error("This workspace's URL cannot be changed in this deployment");
		if (!isOrgAdminRole(workspace.role)) throw new Error("Only admins can change the workspace URL");

		if (!isValidSlug(data.slug)) return { ok: false, error: "invalid" };
		if (!(await isOrgSlugAvailable(data.slug, { excludeOrgId: workspace.id }))) return { ok: false, error: "taken" };

		await db.update(organization).set({ slug: data.slug }).where(eq(organization.id, workspace.id));
		return { ok: true, slug: data.slug };
	});
