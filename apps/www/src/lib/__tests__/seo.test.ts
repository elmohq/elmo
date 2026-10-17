import { describe, expect, it } from "vitest";
import { organizationJsonLd } from "@/lib/seo";

describe("organization schema", () => {
	const organization = JSON.parse(organizationJsonLd().children);

	it("tells answer engines how to reach the company", () => {
		expect(organization.contactPoint).toContainEqual(
			expect.objectContaining({
				"@type": "ContactPoint",
				contactType: "customer support",
				email: "contact@elmohq.com",
			}),
		);
		for (const point of organization.contactPoint) {
			expect(point.contactType).toBeTruthy();
			expect(point.email ?? point.telephone).toBeTruthy();
		}
	});

	it("carries a postal address", () => {
		expect(organization.address).toMatchObject({
			"@type": "PostalAddress",
			streetAddress: expect.any(String),
			addressLocality: expect.any(String),
			postalCode: expect.any(String),
			addressCountry: "US",
		});
	});
});
