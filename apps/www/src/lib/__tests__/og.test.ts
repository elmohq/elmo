import { describe, expect, it } from "vitest";
import { getMarketingOgImage, getPageImage } from "@/lib/og";

const titleOf = (title: string) =>
	new URL(getMarketingOgImage({ title }), "http://localhost").searchParams.get("title");

describe("getMarketingOgImage title", () => {
	it.each([
		["Pricing · Elmo", "Pricing"],
		["Blog | Elmo", "Blog"],
		["Pricing  ·  Elmo", "Pricing"],
		["Pricing · ELMO", "Pricing"],
	])("removes the brand from the end of %j", (title, expected) => {
		expect(titleOf(title)).toBe(expected);
	});

	it.each([
		["Elmo · Open Source AI Visibility", "Open Source AI Visibility"],
		["Elmo - Docs", "Docs"],
		["Elmo: Pricing", "Pricing"],
		["elmo · Pricing", "Pricing"],
		["Elmo·Pricing", "Pricing"],
	])("removes the brand from the start of %j", (title, expected) => {
		expect(titleOf(title)).toBe(expected);
	});

	it("removes the brand from both ends", () => {
		expect(titleOf("Elmo · Pricing · Elmo")).toBe("Pricing");
	});

	it.each([
		["Pricing", "Pricing"],
		["Elmo", "Elmo"],
		["Elmo Cloud", "Elmo Cloud"],
		["Why Elmo · Elmo", "Why Elmo"],
		["Elmo · Why Elmo", "Why Elmo"],
		["Elmohq · Pricing", "Elmohq · Pricing"],
		["Pricing · Elmohq", "Pricing · Elmohq"],
	])("leaves %j as %j", (title, expected) => {
		expect(titleOf(title)).toBe(expected);
	});

	it("keeps special characters through the round trip", () => {
		expect(titleOf("A/B? #1 & more")).toBe("A/B? #1 & more");
	});
});

describe("getMarketingOgImage URL", () => {
	it("always points at /og.png", () => {
		const url = new URL(getMarketingOgImage({ title: "Pricing" }), "http://localhost");
		expect(url.pathname).toBe("/og.png");
	});

	it("passes description and label through", () => {
		const url = new URL(
			getMarketingOgImage({ title: "Pricing", description: "Plans & pricing for teams", label: "Pricing" }),
			"http://localhost",
		);
		expect(url.searchParams.get("description")).toBe("Plans & pricing for teams");
		expect(url.searchParams.get("label")).toBe("Pricing");
	});

	it("leaves out description and label when they are missing", () => {
		const url = new URL(getMarketingOgImage({ title: "Pricing" }), "http://localhost");
		expect(url.searchParams.has("description")).toBe(false);
		expect(url.searchParams.has("label")).toBe(false);
	});

	it("leaves out description and label when they are empty", () => {
		const url = new URL(getMarketingOgImage({ title: "Pricing", description: "", label: "" }), "http://localhost");
		expect(url.searchParams.has("description")).toBe(false);
		expect(url.searchParams.has("label")).toBe(false);
	});
});

describe("getPageImage", () => {
	it("returns only the image for an empty slug list", () => {
		expect(getPageImage([])).toEqual({ segments: ["image.png"], url: "/og/docs/image.png" });
	});

	it("appends the image to nested slugs", () => {
		expect(getPageImage(["guides", "setup"])).toEqual({
			segments: ["guides", "setup", "image.png"],
			url: "/og/docs/guides/setup/image.png",
		});
	});

	it("does not modify the slugs it is given", () => {
		const slugs = ["guides", "setup"];
		getPageImage(slugs);
		expect(slugs).toEqual(["guides", "setup"]);
	});
});
