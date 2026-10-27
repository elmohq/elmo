import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import {
	HEADLINE_ARMS,
	type HeadlineDraw,
	type HeadlineTestConfig,
	headlineTestScript,
	pickHeadline,
	withHeadline,
} from "./headline-test";

const config: HeadlineTestConfig = {
	arms: HEADLINE_ARMS,
	explicitKeys: ["chatgpt", "win-ai-search"],
	storageKey: "elmo.headline-test",
	attribute: "data-headline",
	botPattern: "bot|crawl|spider|lighthouse",
};

const visitor: HeadlineDraw = {
	explicit: null,
	stored: null,
	userAgent: "Mozilla/5.0 (Macintosh) Chrome/140.0",
	automated: false,
	random: 0.3,
};

describe("pickHeadline", () => {
	it("leaves visitors who arrive with a known ?v= out of the test", () => {
		expect(pickHeadline(config, { ...visitor, explicit: "chatgpt" })).toBeNull();
		expect(pickHeadline(config, { ...visitor, explicit: "win-ai-search", stored: "default" })).toBeNull();
	});

	it("enters visitors whose ?v= matches no hero", () => {
		expect(pickHeadline(config, { ...visitor, explicit: "nope" })).not.toBeNull();
	});

	it("keeps a returning visitor on their stored arm", () => {
		for (const random of [0, 0.49, 0.5, 0.99]) {
			expect(pickHeadline(config, { ...visitor, stored: "win-ai-search", random })).toBe("win-ai-search");
			expect(pickHeadline(config, { ...visitor, stored: "default", random })).toBe("default");
		}
	});

	it("splits new visitors evenly between the two arms only", () => {
		const counts = new Map<string | null, number>();
		for (let i = 0; i < 1000; i++) {
			const arm = pickHeadline(config, { ...visitor, random: i / 1000 });
			counts.set(arm, (counts.get(arm) ?? 0) + 1);
		}
		expect(Object.fromEntries(counts)).toEqual({ default: 500, "win-ai-search": 500 });
	});

	it("redraws when the stored value isn't an arm", () => {
		expect(pickHeadline(config, { ...visitor, stored: "chatgpt", random: 0.9 })).toBe("win-ai-search");
	});

	it("shows crawlers and automation the default page", () => {
		expect(pickHeadline(config, { ...visitor, userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1)" })).toBeNull();
		expect(pickHeadline(config, { ...visitor, automated: true })).toBeNull();
	});
});

function browser(search: string, stored: string | null, random: number) {
	const attributes = new Map<string, string>();
	const plausibleScript = new Map<string, string>();
	const context = {
		URLSearchParams,
		Math: { ...Math, floor: Math.floor, random: () => random },
		navigator: { userAgent: visitor.userAgent, webdriver: false },
		window: {
			location: { search },
			localStorage: { getItem: (key: string) => (key === config.storageKey ? stored : null) },
		},
		document: {
			documentElement: {
				getAttribute: (name: string) => attributes.get(name) ?? null,
				setAttribute: (name: string, value: string) => attributes.set(name, value),
			},
			querySelector: (selector: string) =>
				selector === "script[data-domain]"
					? { setAttribute: (name: string, value: string) => plausibleScript.set(name, value) }
					: null,
		},
	};
	const run = () => runInNewContext(headlineTestScript(config), context);
	return { run, attributes, plausibleScript };
}

describe("headlineTestScript", () => {
	it("runs on its own and tags the page and Plausible with the arm", () => {
		const page = browser("", null, 0.9);
		expect(page.run()).toBe("win-ai-search");
		expect(page.attributes.get("data-headline")).toBe("win-ai-search");
		expect(page.plausibleScript.get("event-headline")).toBe("win-ai-search");
	});

	it("keeps the arm already drawn for this page", () => {
		const page = browser("", null, 0.9);
		page.run();
		expect(page.run()).toBe("win-ai-search");
	});

	it("tags nothing for an explicit ?v=", () => {
		const page = browser("?v=chatgpt&gclid=x", "default", 0.1);
		expect(page.run()).toBeNull();
		expect(page.attributes.size).toBe(0);
		expect(page.plausibleScript.size).toBe(0);
	});
});

describe("withHeadline", () => {
	it("adds the arm to a cloud link without dropping its ref", () => {
		const url = new URL(withHeadline("https://app.elmohq.com/?ref=marketing-hero", "win-ai-search"));
		expect(url.searchParams.get("ref")).toBe("marketing-hero");
		expect(url.searchParams.get("hv")).toBe("win-ai-search");
	});

	it("leaves links alone outside the test", () => {
		expect(withHeadline("https://app.elmohq.com/?ref=marketing-hero", null)).toBe(
			"https://app.elmohq.com/?ref=marketing-hero",
		);
	});
});
