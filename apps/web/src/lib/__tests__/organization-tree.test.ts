import { describe, expect, it } from "vitest";
import { organizationTree } from "@/lib/organizations/tree";
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
		expect(children.map((child) => (child.kind === "brand" ? child.brand.name : child.label))).toEqual([
			"nike",
			"adidas",
			"New brand",
		]);
	});

	it("asks for the first brand differently from the next one", () => {
		const { children } = organizationTree(organization({ kind: "allowed" }));
		expect(children).toEqual([{ kind: "action", to: "/app/org/$org/new", label: "Create your first brand" }]);
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
			{ kind: "action", to: "/app/org/$org", label: "Set up Acme" },
		]);
	});

	it("offers no setup once the organization holds a brand", () => {
		expect(organizationTree(organization({ kind: "not-offered" }, ["nike"])).children).toHaveLength(1);
	});
});
