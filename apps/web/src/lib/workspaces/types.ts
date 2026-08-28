/**
 * "Workspace" is the customer-facing name for an organization. These live apart
 * from the server functions that produce them so the shell can name the type
 * without pulling the database into the client bundle.
 */
import type { WriteDenialCode } from "@workspace/lib/entitlements";

export interface WorkspaceBrand {
	id: string;
	/** Null for a brand never given one; `brandParams` falls back to the id. */
	slug: string | null;
	name: string;
	/** For the site icon every brand list renders beside the name. */
	website: string;
	onboarded: boolean;
}

/**
 * The brand allowance lives here because this is read through the query cache:
 * the entitlements it costs are paid once per workspace per minute rather than
 * by each page that offers creation.
 */
export interface WorkspaceSummary {
	id: string;
	/** What `/app/org/$org` carries. */
	slug: string;
	name: string;
	brands: WorkspaceBrand[];
	canCreateBrand: boolean;
	/**
	 * Null both when creation is allowed and when this deployment doesn't create
	 * brands at all — the difference between showing a limit and having no page.
	 */
	brandLimit: { code: WriteDenialCode; message: string } | null;
}

/** The session facts ride along because the shell needs all three together. */
export interface WorkspaceRouteContext {
	workspace: WorkspaceSummary;
	isAdmin: boolean;
	hasReportAccess: boolean;
}
