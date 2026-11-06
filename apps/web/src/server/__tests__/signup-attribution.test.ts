import { describe, expect, it } from "vitest";
import {
	acceptsSignupAttribution,
	SIGNUP_ATTRIBUTION_WINDOW_MS,
	signupAttributionRow,
} from "@/server/signup-attribution-core";

const NOW = new Date("2026-10-27T12:00:00Z");
const justNow = new Date(NOW.getTime() - 60_000);

describe("which signups get attribution", () => {
	it("accepts a cloud account created recently", () => {
		expect(acceptsSignupAttribution({ mode: "cloud", userCreatedAt: justNow, now: NOW })).toBe(true);
		expect(acceptsSignupAttribution({ mode: "cloud", userCreatedAt: justNow.toISOString(), now: NOW })).toBe(true);
	});

	it("ignores an established account arriving through a campaign link", () => {
		const longAgo = new Date(NOW.getTime() - SIGNUP_ATTRIBUTION_WINDOW_MS - 1);
		expect(acceptsSignupAttribution({ mode: "cloud", userCreatedAt: longAgo, now: NOW })).toBe(false);
	});

	it("ignores an admin impersonating the user, whose browser holds their own attribution", () => {
		expect(
			acceptsSignupAttribution({ mode: "cloud", userCreatedAt: justNow, impersonatedBy: "admin-1", now: NOW }),
		).toBe(false);
	});

	it("records nothing outside cloud", () => {
		for (const mode of ["local", "demo", "whitelabel"] as const) {
			expect(acceptsSignupAttribution({ mode, userCreatedAt: justNow, now: NOW })).toBe(false);
		}
	});

	it("rejects an unreadable creation time", () => {
		expect(acceptsSignupAttribution({ mode: "cloud", userCreatedAt: "garbage", now: NOW })).toBe(false);
	});
});

describe("the stored row", () => {
	it("maps campaign tags to columns and gathers click IDs", () => {
		expect(
			signupAttributionRow("user-1", {
				ref: "marketing-hero",
				utm_source: "google",
				utm_medium: "cpc",
				utm_campaign: "brand",
				gclid: "Cj0",
				fbclid: "IwA",
				landing_page: "www.elmohq.com/pricing",
				referrer: "www.google.com",
			}),
		).toEqual({
			userId: "user-1",
			ref: "marketing-hero",
			utmSource: "google",
			utmMedium: "cpc",
			utmCampaign: "brand",
			utmTerm: null,
			utmContent: null,
			clickIds: { gclid: "Cj0", fbclid: "IwA" },
			landingPage: "www.elmohq.com/pricing",
			referrer: "www.google.com",
		});
	});

	it("drops unknown keys rather than storing them", () => {
		const row = signupAttributionRow("user-1", { utm_source: "google", password: "hunter2" });
		expect(JSON.stringify(row)).not.toContain("hunter2");
	});

	it("stores nothing when nothing usable arrived", () => {
		expect(signupAttributionRow("user-1", {})).toBeNull();
		expect(signupAttributionRow("user-1", { email: "a@b.c" })).toBeNull();
	});
});
