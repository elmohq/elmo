/**
 * What a workspace is to the app shell — the customer-facing name for an
 * organization, and the thing `/app/org/$org` names.
 *
 * These live apart from the server functions that produce them so the rail, the
 * switcher, and the header can name the type without pulling the database into
 * the client bundle.
 */

export interface Workspace {
	id: string;
	/** What `/app/org/$org` carries. */
	slug: string;
	name: string;
	role: string;
}

export interface WorkspaceBrand {
	id: string;
	/**
	 * What `/app/org/$org/brand/$brand` carries, or null for a brand that has
	 * never been given one — link with `brandParams`, which falls back to the id.
	 */
	slug: string | null;
	name: string;
	onboarded: boolean;
}

export interface WorkspaceWithBrands extends Workspace {
	brands: WorkspaceBrand[];
	/**
	 * Whether this workspace can take another brand — the deployment feature and
	 * the plan's brand allowance together. Navigation offers brand creation only
	 * where the answer is yes, so the link never leads to a wall.
	 */
	canCreateBrand: boolean;
}
