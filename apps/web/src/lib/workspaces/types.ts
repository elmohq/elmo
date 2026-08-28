/**
 * What a workspace is to the app shell — the customer-facing name for an
 * organization, and the thing `/app/org/$org` names.
 *
 * These live apart from the server functions that produce them so the rail, the
 * switcher, and the header can name the type without pulling the database into
 * the client bundle.
 */
import type { WriteDenialCode } from "@workspace/lib/entitlements";

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
 * A workspace, the brands it owns, and whether it can take another.
 *
 * This is what `/app/org/$org` resolves for every page below it. It is read
 * through the query cache rather than on every navigation, which is what lets
 * the brand allowance live here: asking costs an entitlements read, and once
 * per workspace per minute is a price the switcher, the workspace home and the
 * create-brand page were each paying separately anyway.
 */
export interface WorkspaceSummary {
	id: string;
	/** What `/app/org/$org` carries. */
	slug: string;
	name: string;
	brands: WorkspaceBrand[];
	canCreateBrand: boolean;
	/**
	 * Why the plan refuses another brand, when it is the plan refusing. Null both
	 * when creation is allowed and when this deployment doesn't create brands
	 * from the UI at all — which is the difference between showing the customer a
	 * limit and having no such page to show.
	 */
	brandLimit: { code: WriteDenialCode; message: string } | null;
}

/**
 * What `/app/org/$org` puts in route context, and hands on through its loader,
 * for every page below it.
 *
 * The two session facts ride along with the workspace because the rail needs
 * all three together and one round trip is enough for them.
 */
export interface WorkspaceRouteContext {
	workspace: WorkspaceSummary;
	isAdmin: boolean;
	hasReportAccess: boolean;
}
