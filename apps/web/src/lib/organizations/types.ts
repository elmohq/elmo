/**
 * Apart from the server functions that produce them, so the shell can name the
 * type without pulling the database into the client bundle.
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
 * Three answers rather than a boolean and a nullable message: "the plan says no
 * right now" is waiting on billing and has a page to show, while "this
 * deployment doesn't create brands" has none at all.
 */
export type BrandCreation =
	| { kind: "allowed" }
	| { kind: "denied"; code: WriteDenialCode; message: string }
	| { kind: "not-offered" };

/**
 * The brand allowance rides along because this is read through the query cache,
 * so the entitlements it costs are paid once a minute rather than by each page
 * that offers creation.
 */
export interface OrganizationSummary {
	id: string;
	/** What `/app/org/$org` carries. */
	slug: string;
	name: string;
	brands: OrganizationBrand[];
	brandCreation: BrandCreation;
}
