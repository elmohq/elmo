import { PLAN_KEYS, PLANS } from "@workspace/config/plans";
import { describe, expect, it } from "vitest";
import { softwareApplicationJsonLd } from "@/lib/seo";

describe("the product's structured data", () => {
	it("offers self-hosting free and every cloud plan at its current monthly price", () => {
		const { offers } = JSON.parse(softwareApplicationJsonLd().children);
		const prices = Object.fromEntries(
			offers.offers.map((offer: { name: string; price: string }) => [offer.name, Number(offer.price)]),
		);

		expect(prices).toEqual({
			"Self-hosted": 0,
			...Object.fromEntries(PLAN_KEYS.map((key) => [`Elmo Cloud ${PLANS[key].name}`, PLANS[key].monthlyPriceUsd])),
		});
	});
});
