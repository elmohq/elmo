/**
 * Mock for @/server/workspaces used in Storybook stories. The real module reads
 * the organization/member tables; stories only need the shell to know which
 * workspace it is in and what it holds.
 */

export type WorkspaceBrand = { id: string; slug: string | null; name: string; onboarded: boolean };
export type Workspace = { id: string; slug: string; name: string; role: string };
export type WorkspaceWithBrands = Workspace & { brands: WorkspaceBrand[]; canCreateBrand: boolean };

let _workspaces: WorkspaceWithBrands[] = [
	{
		id: "org-1",
		slug: "acme",
		name: "Acme",
		role: "admin",
		canCreateBrand: true,
		brands: [
			{ id: "brand-1", slug: "acme", name: "Acme", onboarded: true },
			{ id: "brand-2", slug: "acme-labs", name: "Acme Labs", onboarded: true },
		],
	},
];

export function setMockWorkspaces(workspaces: WorkspaceWithBrands[]) {
	_workspaces = workspaces;
}

export const listWorkspacesFn = async () => _workspaces;
export const resolveWorkspaceFn = async () => _workspaces[0];
export const resolveBrandFn = async () => ({ id: _workspaces[0].brands[0]?.id ?? "brand-1", slug: null });
export const getWorkspaceSettingsFn = async () => ({
	workspace: _workspaces[0],
	brandCount: _workspaces[0].brands.length,
	memberCount: 2,
	canRename: true,
});
export const renameWorkspaceFn = async () => ({ success: true });
export const setWorkspaceSlugFn = async () => ({ ok: true, slug: _workspaces[0].slug });
export const getNotFoundContextFn = async () => ({ suggestion: null, workspaces: _workspaces });
