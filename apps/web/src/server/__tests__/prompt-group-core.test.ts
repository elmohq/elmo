import { UNLIMITED_ENTITLEMENTS } from "@workspace/config/entitlements";
import { parseScrapeTargets } from "@workspace/config/scrape-targets";
import { describe, expect, it } from "vitest";
import { describeGroupRuns } from "@/server/prompt-group-core";

const member = (id: string, country: string, language: string) => ({
	id,
	value: "best running shoes",
	enabled: true,
	country,
	language,
	premiumModels: [],
});

describe("how each model runs a group", () => {
	it("says per variant whether a model runs it and what reaches the provider", () => {
		const rows = describeGroupRuns({
			members: [member("us", "US", "en"), member("de", "DE", "de")],
			scrapeTargets: parseScrapeTargets("google-ai-mode:dataforseo:online,perplexity:brightdata:online"),
			brand: { enabledModels: null, delayOverrideHours: null },
			entitlements: UNLIMITED_ENTITLEMENTS,
			defaultDelayHours: 24,
		});

		const aiMode = rows.find((row) => row.model === "google-ai-mode");
		expect(aiMode?.byPrompt.de).toEqual({ runs: true, country: "localized", language: "sent" });

		// Listed rather than dropped, so the page can say why Germany has no Perplexity data.
		const perplexity = rows.find((row) => row.model === "perplexity");
		expect(perplexity?.byPrompt.us).toMatchObject({ runs: true, country: "provider-default" });
		expect(perplexity?.byPrompt.de).toMatchObject({ runs: false, country: "unsupported" });
	});
});
