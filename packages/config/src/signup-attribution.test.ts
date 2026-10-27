import { describe, expect, it } from "vitest";
import {
	attributionFromLanding,
	firstTouch,
	MAX_ATTRIBUTION_VALUE_LENGTH,
	sanitizeAttribution,
	withAttribution,
} from "./signup-attribution";

describe("sanitizeAttribution", () => {
	it("keeps only known keys with string values", () => {
		expect(
			sanitizeAttribution({
				utm_source: "google",
				gclid: "abc",
				ref: "marketing-hero",
				email: "someone@example.com",
				utm_medium: 42,
				li_fat_id: ["x"],
			}),
		).toEqual({ utm_source: "google", gclid: "abc", ref: "marketing-hero" });
	});

	it("caps, trims, and strips control characters", () => {
		const clean = sanitizeAttribution({ utm_campaign: `  spring\u0000\n${"x".repeat(1000)}` });
		expect(clean.utm_campaign).toHaveLength(MAX_ATTRIBUTION_VALUE_LENGTH);
		expect(clean.utm_campaign?.startsWith("springx")).toBe(true);
	});

	it("drops empty values and rejects anything that isn't an object", () => {
		expect(sanitizeAttribution({ utm_source: "   " })).toEqual({});
		expect(sanitizeAttribution(null)).toEqual({});
		expect(sanitizeAttribution("utm_source=google")).toEqual({});
		expect(sanitizeAttribution(["google"])).toEqual({});
	});
});

describe("attributionFromLanding", () => {
	it("records campaign tags, click IDs, the landing page, and the external referrer", () => {
		expect(
			attributionFromLanding(
				"https://www.elmohq.com/pricing?utm_source=google&utm_medium=cpc&gclid=Cj0&unrelated=1",
				"https://www.google.com/search?q=elmo",
			),
		).toEqual({
			utm_source: "google",
			utm_medium: "cpc",
			gclid: "Cj0",
			landing_page: "www.elmohq.com/pricing",
			referrer: "www.google.com",
		});
	});

	it("doesn't count the site itself as a referrer", () => {
		expect(attributionFromLanding("https://www.elmohq.com/blog", "https://www.elmohq.com/")).toEqual({
			landing_page: "www.elmohq.com/blog",
		});
	});

	it("prefers the landing page and referrer forwarded from the marketing site", () => {
		expect(
			attributionFromLanding(
				"https://app.elmohq.com/auth/register?ref=marketing-hero&utm_source=newsletter&landing_page=www.elmohq.com%2Fblog%2Fx&referrer=news.ycombinator.com",
				"https://www.elmohq.com/",
			),
		).toEqual({
			ref: "marketing-hero",
			utm_source: "newsletter",
			landing_page: "www.elmohq.com/blog/x",
			referrer: "news.ycombinator.com",
		});
	});

	it("treats a forwarded direct visit as direct, not as referred by the marketing site", () => {
		expect(
			attributionFromLanding(
				"https://app.elmohq.com/?ref=marketing-nav&landing_page=www.elmohq.com%2F",
				"https://www.elmohq.com/",
			),
		).toEqual({ ref: "marketing-nav", landing_page: "www.elmohq.com/" });
	});
});

describe("firstTouch", () => {
	it("keeps what was stored first", () => {
		expect(firstTouch({ utm_source: "google" }, { utm_source: "bing" })).toEqual({ utm_source: "google" });
	});

	it("takes the current visit when nothing is stored", () => {
		expect(firstTouch(null, { utm_source: "bing" })).toEqual({ utm_source: "bing" });
		expect(firstTouch({}, { utm_source: "bing" })).toEqual({ utm_source: "bing" });
	});
});

describe("withAttribution", () => {
	const link = "https://app.elmohq.com/?ref=marketing-hero";

	it("appends the visitor's tags to an app link", () => {
		const url = new URL(
			withAttribution(link, { utm_source: "google", gclid: "Cj0", landing_page: "www.elmohq.com/pricing" }),
		);
		expect(url.searchParams.get("ref")).toBe("marketing-hero");
		expect(url.searchParams.get("utm_source")).toBe("google");
		expect(url.searchParams.get("gclid")).toBe("Cj0");
		expect(url.searchParams.get("landing_page")).toBe("www.elmohq.com/pricing");
	});

	it("never replaces the link's own ref or tags", () => {
		const url = new URL(
			withAttribution(`${link}&utm_source=site`, { ref: "cli", utm_source: "google", utm_medium: "cpc" }),
		);
		expect(url.searchParams.get("ref")).toBe("marketing-hero");
		expect(url.searchParams.get("utm_source")).toBe("site");
		expect(url.searchParams.get("utm_medium")).toBe("cpc");
	});

	it("leaves the link untouched when there is nothing to add", () => {
		expect(withAttribution(link, {})).toBe(link);
		expect(withAttribution("not a url", { utm_source: "google" })).toBe("not a url");
	});
});
