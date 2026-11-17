import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "storybook/test";
import { PromptMarketInfo } from "@/components/prompt-market-info";
import { PromptVariants } from "@/components/prompt-variants";
import { selfHostedMarketSupport } from "./_mocks/market-support";

const meta = {
	title: "Components/PromptMarkets",
} satisfies Meta;

export default meta;

const germany = { country: "DE", language: "de" };

/**
 * The prompt page's market line: where the prompt is asked, whether that is its
 * own setting, and how many tracked models can answer from there. Opening it
 * says what each model does.
 */
export const OwnMarket: StoryObj = {
	render: () => (
		<div className="space-y-4 p-8 text-sm">
			<PromptMarketInfo market={germany} overridden support={selfHostedMarketSupport} />
			<PromptVariants
				market={germany}
				variants={[
					{ id: "1", value: "best crm for small business", enabled: true, market: { country: "US", language: "en" } },
					{ id: "2", value: "welches CRM für Start-ups", enabled: true, market: germany },
					{ id: "3", value: "meilleur CRM pour PME", enabled: false, market: { country: "FR", language: "fr" } },
				]}
			/>
		</div>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole("button", { name: /Germany · German.*set on this prompt.*3 of 4 models/ }));
		await expect(
			await within(document.body).findByText(/Skips this prompt: it can't answer from Germany/),
		).toBeVisible();
		// A variant in the viewed prompt's market needs no label; the others say where they are asked.
		await expect(canvas.getByText("United States · English")).toBeVisible();
		await expect(canvas.queryByText("Germany · German", { selector: "[data-slot=badge]" })).toBeNull();
	},
};

export const BrandDefault: StoryObj = {
	render: () => (
		<div className="p-8 text-sm">
			<PromptMarketInfo
				market={{ country: "US", language: "en" }}
				overridden={false}
				support={selfHostedMarketSupport}
			/>
		</div>
	),
};
