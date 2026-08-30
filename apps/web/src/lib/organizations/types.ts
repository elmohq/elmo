import type { WriteDenialCode } from "@workspace/lib/entitlements";

export interface OrganizationBrand {
	id: string;
	slug: string | null;
	name: string;
	website: string;
	onboarded: boolean;
}

export type BrandCreation =
	| { kind: "allowed" }
	| { kind: "denied"; code: WriteDenialCode; message: string }
	| { kind: "not-offered" };

export interface OrganizationSummary {
	id: string;
	slug: string;
	name: string;
	brands: OrganizationBrand[];
	brandCreation: BrandCreation;
}

export interface OrganizationsView {
	signedIn: boolean;
	organizations: OrganizationSummary[];
}
