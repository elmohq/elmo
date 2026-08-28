/**
 * What a workspace is to the app shell — the customer-facing name for an
 * organization, and the thing `/app/org/$org` names.
 *
 * These live apart from the server functions that produce them so the rail, the
 * switcher, and the header can name the type without pulling the database into
 * the client bundle.
 */

export interface WorkspaceBrand {
	id: string;
	/**
	 * What `/app/org/$org/brand/$brand` carries, or null for a brand that has
	 * never been given one — link with `brandParams`, which falls back to the id.
	 */
	slug: string | null;
	name: string;
	/** For the site icon every brand list renders beside the name. */
	website: string;
	onboarded: boolean;
}

/**
 * A workspace and the brands it owns, from two indexed reads.
 *
 * This is what the `/app/org/$org` layout resolves on every navigation into the
 * workspace, so it holds only what is cheap to fetch and what the URL itself
 * depends on: the brand list is how `$brand` resolves its segment without a
 * round trip.
 */
export interface WorkspaceSummary {
	id: string;
	/** What `/app/org/$org` carries. */
	slug: string;
	name: string;
	role: string;
	brands: WorkspaceBrand[];
}

/**
 * A workspace plus whether it can take another brand — the deployment feature
 * and the plan's brand allowance together.
 *
 * Separate from `WorkspaceSummary` because answering it costs an entitlements
 * read: only the pages that offer brand creation ask, and none of them is on
 * the dashboard's filter path.
 */
export interface WorkspaceWithBrands extends WorkspaceSummary {
	canCreateBrand: boolean;
}

/**
 * What `/app/org/$org` puts in route context for every page below it.
 *
 * The two session facts ride along with the workspace because the rail needs
 * all three together and one round trip is enough for them.
 */
export interface WorkspaceRouteContext {
	workspace: WorkspaceSummary;
	isAdmin: boolean;
	hasReportAccess: boolean;
}
