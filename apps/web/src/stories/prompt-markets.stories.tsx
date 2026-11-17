import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "storybook/test";
import { PromptMarketInfo } from "@/components/prompt-market-info";
import { PromptVariantsMenu } from "@/components/prompt-variants";
import { selfHostedMarketSupport } from "./_mocks/market-support";

const meta = {
	title: "Components/PromptMarkets",
} satisfies Meta;

export default meta;

const germany = { country: "DE", language: "de" };

const VARIANTS = [
	{ id: "1", value: "best crm for small business", enabled: true, market: { country: "US", language: "en" } },
	{ id: "2", value: "welches CRM für Start-ups", enabled: true, market: germany },
	{ id: "3", value: "meilleur CRM pour PME", enabled: false, market: { country: "FR", language: "fr" } },
];

function Controls() {
	return (
		<div className="flex items-center justify-end gap-1.5 p-8">
			<PromptVariantsMenu promptId="2" variants={VARIANTS} />
			<PromptMarketInfo market={germany} overridden support={selfHostedMarketSupport} />
		</div>
	);
}

/**
 * The prompt page's market control names the market like a filter would, and
 * opens to whose setting it is and which tracked models can't answer from there.
 */
export const Market: StoryObj = {
	render: () => <Controls />,
	play: async ({ canvasElement }) => {
		await userEvent.click(within(canvasElement).getByRole("button", { name: "Market: Germany · German" }));
		const page = within(document.body);
		await expect(await page.findByText("Set on This Prompt")).toBeVisible();
		await expect(page.getByText(/3 of 4 models run prompts asked from Germany/)).toBeVisible();
	},
};

/** The variants menu lists every wording of the question with the market each is asked in. */
export const Variants: StoryObj = {
	render: () => <Controls />,
	play: async ({ canvasElement }) => {
		await userEvent.click(within(canvasElement).getByRole("button", { name: /Variants/ }));
		const page = within(document.body);
		await expect(await page.findByRole("menuitemradio", { name: /welches CRM für Start-ups/ })).toHaveAttribute(
			"aria-checked",
			"true",
		);
		await expect(
			page.getByRole("menuitemradio", { name: /meilleur CRM pour PME.*France · French.*Disabled/ }),
		).toBeVisible();
	},
};
