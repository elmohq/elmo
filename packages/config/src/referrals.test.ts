import { describe, expect, it } from "vitest";
import {
	bookDemoUrl,
	classifyLinkClick,
	cloudAppUrl,
	cloudPricingUrl,
	cloudSignupUrl,
	demoSiteUrl,
	marketingUrl,
} from "./referrals";

/**
 * The contract every one of these has to keep: land on the right page, and say
 * where the click came from. A link that quietly drops its ref still works, so
 * only a test notices.
 */
describe("referral links", () => {
	const builders = {
		marketing: () => marketingUrl("/docs", "cli"),
		app: () => cloudAppUrl("cli"),
		signup: () => cloudSignupUrl("cli"),
		pricing: () => cloudPricingUrl("cli"),
		demo: () => bookDemoUrl("cli"),
		liveDemo: () => demoSiteUrl("cli"),
	};

	it.each(Object.entries(builders))("%s carries the source", (_name, build) => {
		expect(new URL(build()).searchParams.get("ref")).toBe("cli");
	});

	it("points each destination at its own page", () => {
		expect(marketingUrl("/docs", "cloud-signin")).toBe("https://www.elmohq.com/docs?ref=cloud-signin");
		expect(cloudAppUrl("marketing-cta")).toBe("https://app.elmohq.com/?ref=marketing-cta");
		expect(cloudSignupUrl("cloud-signin")).toBe("https://app.elmohq.com/auth/register?ref=cloud-signin");
		expect(cloudPricingUrl("cloud-signin")).toBe("https://www.elmohq.com/pricing?ref=cloud-signin");
		expect(bookDemoUrl("cloud-signin")).toBe("https://www.elmohq.com/demo?ref=cloud-signin");
		expect(demoSiteUrl("cloud-signin")).toBe("https://demo.elmohq.com/?ref=cloud-signin");
	});
});

describe("classifyLinkClick", () => {
	const WWW_PAGE = "https://www.elmohq.com/pricing?utm_source=x";

	it("counts a tagged cloud link as a cloud CTA click with its source", () => {
		expect(classifyLinkClick(cloudAppUrl("marketing-hero"), WWW_PAGE)).toEqual({
			goal: "Cloud CTA Click",
			props: { ref: "marketing-hero", page: "/pricing", destination: "app.elmohq.com/" },
		});
		expect(classifyLinkClick(cloudSignupUrl("marketing-nav"), WWW_PAGE)?.props.destination).toBe(
			"app.elmohq.com/auth/register",
		);
	});

	it("counts live demo and booking links as their own goals", () => {
		expect(classifyLinkClick(demoSiteUrl("marketing-hero"), WWW_PAGE)?.goal).toBe("Live Demo Click");
		expect(classifyLinkClick(bookDemoUrl("marketing-cta"), WWW_PAGE)?.goal).toBe("Book Demo Click");
		expect(classifyLinkClick("/demo", WWW_PAGE)?.goal).toBe("Book Demo Click");
	});

	it("leaves the source out when the link carries none", () => {
		expect(classifyLinkClick("https://app.elmohq.com/auth/login", WWW_PAGE)?.props).toEqual({
			page: "/pricing",
			destination: "app.elmohq.com/auth/login",
		});
	});

	it("counts the demo deployment's links to cloud", () => {
		expect(classifyLinkClick(cloudSignupUrl("demo-chat"), "https://demo.elmohq.com/app/x")?.props).toEqual({
			ref: "demo-chat",
			page: "/app/x",
			destination: "app.elmohq.com/auth/register",
		});
	});

	it("ignores links within the site the visitor is already on", () => {
		expect(classifyLinkClick(cloudSignupUrl("cloud-signin"), "https://app.elmohq.com/auth/login")).toBeNull();
		expect(classifyLinkClick("/app", "https://demo.elmohq.com/")).toBeNull();
	});

	it("ignores unrelated and unparseable links", () => {
		expect(classifyLinkClick("https://github.com/elmohq/elmo", WWW_PAGE)).toBeNull();
		expect(classifyLinkClick(marketingUrl("/docs", "cli"), WWW_PAGE)).toBeNull();
		expect(classifyLinkClick("mailto:hello@elmohq.com", WWW_PAGE)).toBeNull();
		expect(classifyLinkClick("http://[bad", WWW_PAGE)).toBeNull();
	});
});
