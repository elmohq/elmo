/**
 * Server functions for workspaces — the customer-facing name for an
 * organization, and the thing `/app/$org` names.
 *
 * Access is membership: everything here resolves the org through the caller's
 * `member` rows, so an unknown workspace and someone else's workspace are the
 * same answer.
 */
import { createServerFn } from "@tanstack/react-start";
import { isOrgAdminRole } from "@workspace/config/roles";
import { db } from "@workspace/lib/db/db";
import { brands, member, organization } from "@workspace/lib/db/schema";
import { asc, count, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
	findBrandWorkspace,
	listUserOrganizations,
	requireAuthSession,
	requireOrganization,
	resolveOrganization,
} from "@/lib/auth/helpers";
import { getDeployment } from "@/lib/config/server";
import { decideBrandCreation } from "@/lib/workspaces/server";
import type { Workspace, WorkspaceWithBrands } from "@/lib/workspaces/types";

export type { Workspace, WorkspaceBrand, WorkspaceWithBrands } from "@/lib/workspaces/types";

/**
 * What the `/app/$org` segment resolved to.
 *
 * `redirectToBrand` is the one-brand-id-in-the-workspace-slot case: links minted
 * before workspaces were in the URL (dunning emails, bookmarks, a whitelabel
 * parent dashboard) put a brand id where a workspace slug now goes, and the
 * layout turns those into the canonical path rather than a 404.
 */
export type WorkspaceResolution =
	| { found: true; workspace: Workspace }
	| { found: false; redirectToBrand: { organizationSlug: string } | null };

export const resolveWorkspaceFn = createServerFn({ method: "GET" })
	.validator(z.object({ org: z.string() }))
	// The explicit return type breaks the type-inference cycle between this fn
	// and the route loaders that both consume it and redirect to typed routes.
	.handler(async ({ data }): Promise<WorkspaceResolution> => {
		const session = await requireAuthSession();

		const workspace = await resolveOrganization(session.user.id, data.org);
		if (workspace) return { found: true, workspace };

		const brandWorkspace = await findBrandWorkspace(session.user.id, data.org);
		return { found: false, redirectToBrand: brandWorkspace };
	});

/**
 * Every workspace the user belongs to, each with its brands — what the switcher
 * and the `/app` picker render.
 */
export const listWorkspacesFn = createServerFn({ method: "GET" }).handler(async (): Promise<WorkspaceWithBrands[]> => {
	const session = await requireAuthSession();
	const orgs = await listUserOrganizations(session.user.id);
	if (orgs.length === 0) return [];

	const orgIds = orgs.map((org) => org.id);
	const [rows, canCreate] = await Promise.all([
		db
			.select({
				id: brands.id,
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
			.map(({ id, name, onboarded }) => ({ id, name, onboarded })),
		canCreateBrand: canCreate.get(org.id) ?? false,
	}));
});

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
