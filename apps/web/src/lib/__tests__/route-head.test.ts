import { describe, expect, it } from "vitest";
import { buildTitle, getAppName, pageHead } from "@/lib/route-head";
import { BRAND_ROUTE_ID, ORG_ROUTE_ID } from "@/lib/route-subject";

const orgMatch = (name: string) => ({
	routeId: ORG_ROUTE_ID,
	loaderData: { organization: { name } },
});

const brandMatch = (name: string) => ({
	routeId: BRAND_ROUTE_ID,
	loaderData: { brand: { name } },
});

const branded = (name: string) => ({
	context: { clientConfig: { branding: { name } } },
});

describe("getAppName", () => {
	it('returns "Elmo" when the match has no context', () => {
		expect(getAppName({})).toBe("Elmo");
	});

	it("returns the branding name when set", () => {
		expect(getAppName(branded("Acme Insights"))).toBe("Acme Insights");
	});

	it('returns "Elmo" when the branding name is an empty string', () => {
		expect(getAppName(branded(""))).toBe("Elmo");
	});
});

describe("buildTitle", () => {
	it("joins page and app with a middle dot when there is no subject", () => {
		expect(buildTitle("Prompts", { appName: "Elmo" })).toBe("Prompts · Elmo");
	});

	it("includes the subject with a pipe when provided", () => {
		expect(buildTitle("Prompts", { appName: "Elmo", subject: "Acme" })).toBe("Prompts | Acme · Elmo");
	});
});

describe("pageHead", () => {
	it("names the brand rather than the organization inside a brand", () => {
		expect(pageHead({ title: "Sentiment" })({ match: {}, matches: [orgMatch("Globex"), brandMatch("Acme")] })).toEqual({
			meta: [{ title: "Sentiment | Acme · Elmo" }],
		});
	});

	it("uses the organization when there is no brand route", () => {
		expect(pageHead({ title: "Settings" })({ match: {}, matches: [orgMatch("Globex")] })).toEqual({
			meta: [{ title: "Settings | Globex · Elmo" }],
		});
	});

	it("has no subject outside an organization", () => {
		expect(pageHead({ title: "Admin" })({ match: {}, matches: [] })).toEqual({
			meta: [{ title: "Admin · Elmo" }],
		});
	});

	it("uses the breadcrumb when no title is given", () => {
		expect(pageHead({})({ match: { staticData: { crumb: "Prompts" } }, matches: [] })).toEqual({
			meta: [{ title: "Prompts · Elmo" }],
		});
	});

	it("prefers the explicit title over the breadcrumb", () => {
		expect(pageHead({ title: "A" })({ match: { staticData: { crumb: "B" } }, matches: [] })).toEqual({
			meta: [{ title: "A · Elmo" }],
		});
	});

	it("uses just the app name when there is neither a title nor a breadcrumb", () => {
		expect(pageHead({})({ match: {}, matches: [] })).toEqual({
			meta: [{ title: "Elmo" }],
		});
	});

	it("uses the branding name in the title", () => {
		expect(pageHead({ title: "Prompts" })({ match: branded("Acme Insights"), matches: [] })).toEqual({
			meta: [{ title: "Prompts · Acme Insights" }],
		});
	});

	it("adds a description meta tag only when one is given", () => {
		expect(pageHead({ title: "A", description: "D" })({ match: {}, matches: [] })).toEqual({
			meta: [{ title: "A · Elmo" }, { name: "description", content: "D" }],
		});
		expect(pageHead({ title: "A" })({ match: {}, matches: [] })).toEqual({
			meta: [{ title: "A · Elmo" }],
		});
	});
});
