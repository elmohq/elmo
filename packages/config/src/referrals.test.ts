import { describe, expect, it } from "vitest";
import { bookDemoUrl, cloudPricingUrl, cloudSignupUrl, marketingUrl } from "./referrals";

/**
 * The contract every one of these has to keep: land on the right page, and say
 * where the click came from. A link that quietly drops its ref still works, so
 * only a test notices.
 */
describe("referral links", () => {
	const builders = {
		marketing: () => marketingUrl("/docs", "cli"),
		signup: () => cloudSignupUrl("cli"),
		pricing: () => cloudPricingUrl("cli"),
		demo: () => bookDemoUrl("cli"),
	};

	it.each(Object.entries(builders))("%s carries the source", (_name, build) => {
		expect(new URL(build()).searchParams.get("ref")).toBe("cli");
	});

	it("points each destination at its own page", () => {
		expect(marketingUrl("/docs", "cloud-signin")).toBe("https://www.elmohq.com/docs?ref=cloud-signin");
		expect(cloudSignupUrl("cloud-signin")).toBe("https://app.elmohq.com/auth/register?ref=cloud-signin");
		expect(cloudPricingUrl("cloud-signin")).toBe("https://www.elmohq.com/pricing?ref=cloud-signin");
		expect(bookDemoUrl("cloud-signin")).toBe("https://cal.com/jrhizor/elmo?ref=cloud-signin");
	});
});
