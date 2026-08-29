/**
 * "Organization" is the customer-facing name for an organization. These live apart
 * from the server functions that produce them so the shell can name the type
 * without pulling the database into the client bundle.
 */
import type { WriteDenialCode } from "@workspace/lib/entitlements";

export interface OrganizationBrand {
	id: string;
	/** Null for a brand never given one; `brandParams` falls back to the id. */
	slug: string | null;
	name: string;
	/** For the site icon every brand list renders beside the name. */
	website: string;
	onboarded: boolean;
}

/**
 * Whether this organization can take another brand, and why not when it can't.
 *
 * Three answers rather than a boolean and a nullable message: "the plan says no
 * right now" is waiting on billing and has something to show, while "this
 * deployment doesn't create brands" has no page to offer at all. Callers that
 * read those apart were spelling out combinations of the two fields, and one of
 * them was reading a missing message as a deployment mode.
 */
export type BrandCreation =
	| { kind: "allowed" }
	| { kind: "denied"; code: WriteDenialCode; message: string }
	| { kind: "not-offered" };

/**
 * The brand allowance lives here because this is read through the query cache:
 * the entitlements it costs are paid once per organization per minute rather than
 * by each page that offers creation.
 */
export interface OrganizationSummary {
	id: string;
	/** What `/app/org/$org` carries. */
	slug: string;
	name: string;
	brands: OrganizationBrand[];
	brandCreation: BrandCreation;
}
