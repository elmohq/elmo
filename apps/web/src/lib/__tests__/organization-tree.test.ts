import { describe, expect, it } from "vitest";
import { needsSetup, organizationTree } from "@/lib/organizations/tree";
import type { BrandCreation, OrganizationSummary } from "@/lib/organizations/types";

function organization(brandCreation: BrandCreation, brandNames: string[] = []): OrganizationSummary {
	return {
		id: "org-1",
		slug: "acme",
		name: "Acme",
		brandCreation,
		brands: brandNames.map((name) => ({
			id: name,
			slug: name,
			name,
			website: `https://${name}.com`,
			onboarded: true,
		})),
	};
}

describe("organizationTree", () => {
	it("names the heading for what it leads to, so every surface says it the same way", () => {
		expect(organizationTree(organization({ kind: "allowed" })).settingsLabel).toBe("Acme organization settings");
	});

	it("lists the brands, then the way to add one", () => {
		const { children } = organizationTree(organization({ kind: "allowed" }, ["nike", "adidas"]));
		expect(children.map((row) => row.label)).toEqual(["nike", "adidas", "New brand"]);
	});

	// Every surface renders the row it is handed rather than deciding where it
	// goes, so the target travelling with the row is the contract.
	it("hands each row its own address", () => {
		const { children } = organizationTree(organization({ kind: "allowed" }, ["nike"]));
		expect(children.map((row) => row.link)).toEqual([
			{ to: "/app/org/$org/brand/$brand", params: { org: "acme", brand: "nike" } },
			{ to: "/app/org/$org/new", params: { org: "acme" } },
		]);
	});

	// Every row says which kind it is, so a surface draws it from what it is
	// rather than from a field it happens to be missing.
	it("says what each row is", () => {
		const { children } = organizationTree(organization({ kind: "allowed" }, ["nike"]));
		expect(children.map((row) => row.kind)).toEqual(["brand", "new-brand"]);
		expect(children[0]).toMatchObject({ id: "nike", website: "https://nike.com" });
	});

	it("asks for the first brand differently from the next one", () => {
		const { children } = organizationTree(organization({ kind: "allowed" }));
		expect(children).toEqual([
			{
				kind: "new-brand",
				key: "new-brand",
				link: { to: "/app/org/$org/new", params: { org: "acme" } },
				label: "Create your first brand",
			},
		]);
	});

	// The plan has run out. The page that would explain it says so; the tree
	// doesn't offer a button that leads to a refusal.
	it("offers nothing when the plan refuses another brand", () => {
		expect(
			organizationTree(organization({ kind: "denied", code: "brand-limit", message: "No" }, ["nike"])).children,
		).toHaveLength(1);
	});

	// Auth0 filled this organization and nobody set it up. Without this row the
	// wizard at /app/org/$org has nothing linking to it.
	it("leads an empty organization to its setup, where brands aren't created here", () => {
		expect(organizationTree(organization({ kind: "not-offered" })).children).toEqual([
			{ kind: "set-up", key: "set-up", link: { to: "/app/org/$org", params: { org: "acme" } }, label: "Set up Acme" },
		]);
	});

	it("offers no setup once the organization holds a brand", () => {
		expect(organizationTree(organization({ kind: "not-offered" }, ["nike"])).children).toHaveLength(1);
	});
});

// The row that leads to the wizard and the route that decides whether there is
// one read the same fact, so a link that bounces off a redirect can't happen.
describe("needsSetup", () => {
	it("is true only for an empty organization this deployment doesn't create brands in", () => {
		expect(needsSetup(organization({ kind: "not-offered" }))).toBe(true);
		expect(needsSetup(organization({ kind: "not-offered" }, ["nike"]))).toBe(false);
		expect(needsSetup(organization({ kind: "allowed" }))).toBe(false);
		expect(needsSetup(organization({ kind: "denied", code: "brand-limit", message: "No" }))).toBe(false);
	});
});
