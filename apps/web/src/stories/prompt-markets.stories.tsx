import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "storybook/test";
import { PromptMarketsView } from "@/components/prompt-markets-panel";
import type { GroupTargetRow } from "@/server/prompt-group-core";

const meta = {
	title: "Components/PromptMarkets",
} satisfies Meta;

export default meta;

const members = [
	{ id: "us", value: "best running shoes for flat feet", enabled: true, country: "US", language: "en" },
	{ id: "gb", value: "best running shoes for flat feet", enabled: true, country: "GB", language: "en" },
	{ id: "fr", value: "meilleures chaussures de running pieds plats", enabled: true, country: "FR", language: "fr" },
];

const localized = { runs: true, country: "localized", language: "prompt-text" } as const;

const targets: GroupTargetRow[] = [
	{
		key: "google-ai-mode::dataforseo::web",
		model: "google-ai-mode",
		modelLabel: "Google AI Mode",
		providerName: "DataForSEO",
		webSearch: true,
		premium: false,
		byPrompt: {
			us: { ...localized, language: "sent" },
			gb: { ...localized, language: "sent" },
			fr: { ...localized, language: "sent" },
		},
	},
	{
		key: "chatgpt::brightdata::web",
		model: "chatgpt",
		modelLabel: "ChatGPT",
		providerName: "BrightData",
		webSearch: true,
		premium: false,
		byPrompt: { us: localized, gb: localized, fr: localized },
	},
	{
		key: "perplexity::brightdata::web",
		model: "perplexity",
		modelLabel: "Perplexity",
		providerName: "BrightData",
		webSearch: true,
		premium: false,
		byPrompt: {
			us: { runs: true, country: "provider-default", language: "prompt-text" },
			gb: { runs: false, country: "unsupported", language: "prompt-text" },
			fr: { runs: false, country: "unsupported", language: "prompt-text" },
		},
	},
	{
		key: "claude::anthropic-api::base",
		model: "claude",
		modelLabel: "Claude",
		providerName: "Anthropic API",
		webSearch: false,
		premium: false,
		byPrompt: {
			us: { runs: true, country: "location-free", language: "prompt-text" },
			gb: { runs: true, country: "location-free", language: "prompt-text" },
			fr: { runs: true, country: "location-free", language: "prompt-text" },
		},
	},
];

/** The prompt page for the UK variant, with its per-model breakdown unfolded. */
export const Variants: StoryObj = {
	render: () => (
		<div className="max-w-5xl p-8">
			<PromptMarketsView promptId="gb" members={members} targets={targets} />
		</div>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole("button", { name: /how each model runs/i }));
		await expect(canvas.getByText("Skipped, can't ask from United Kingdom")).toBeVisible();
		await expect(canvas.getAllByText("Asked from United Kingdom")).toHaveLength(2);
	},
};
