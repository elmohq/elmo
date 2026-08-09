import { describe, expect, it } from "vitest";
import type { PlatformOption } from "@/components/platform-picker";
import { groupPlatformOptions } from "@/lib/platform-groups";

function option(partial: Partial<PlatformOption> & { model: string }): PlatformOption {
	return { webSearch: false, access: "api", costPerRunUsd: null, ...partial };
}

describe("groupPlatformOptions", () => {
	it("separates scraped surfaces, ungrounded APIs and grounded APIs", () => {
		const groups = groupPlatformOptions([
			option({ model: "chatgpt", access: "scraped", webSearch: true }),
			option({ model: "claude" }),
			option({ model: "claude-web", webSearch: true }),
		]);

		expect(groups.map((g) => g.id)).toEqual(["scraped", "api", "premium"]);
		expect(groups[0].options.map((o) => o.model)).toEqual(["chatgpt"]);
		expect(groups[1].options.map((o) => o.model)).toEqual(["claude"]);
		expect(groups[2].options.map((o) => o.model)).toEqual(["claude-web"]);
	});

	it("counts a scraped target as scraped even though it searches the web", () => {
		// A scraped engine is always web-grounded; what distinguishes it is that we
		// read the rendered consumer surface rather than calling a model.
		const [group] = groupPlatformOptions([option({ model: "perplexity", access: "scraped", webSearch: true })]);
		expect(group.id).toBe("scraped");
	});

	it("omits groups the instance configures nothing for", () => {
		const groups = groupPlatformOptions([option({ model: "grok" }), option({ model: "mistral" })]);
		expect(groups.map((g) => g.id)).toEqual(["api"]);
	});

	it("keeps SCRAPE_TARGETS order inside a group", () => {
		const [group] = groupPlatformOptions([
			option({ model: "mistral" }),
			option({ model: "grok" }),
			option({ model: "claude" }),
		]);
		expect(group.options.map((o) => o.model)).toEqual(["mistral", "grok", "claude"]);
	});

	it("returns nothing when no targets are configured", () => {
		expect(groupPlatformOptions([])).toEqual([]);
	});

	it("gives every group copy the page can render outside a tooltip", () => {
		for (const group of groupPlatformOptions([
			option({ model: "chatgpt", access: "scraped", webSearch: true }),
			option({ model: "claude" }),
			option({ model: "claude-web", webSearch: true }),
		])) {
			expect(group.title).toBeTruthy();
			expect(group.description.length).toBeGreaterThan(40);
		}
	});
});
