import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "storybook/test";
import { PromptCountryInfo } from "@/components/prompt-country-info";
import { PromptVariantsMenu } from "@/components/prompt-variants";
import { selfHostedMarketSupport } from "./_mocks/market-support";

const meta = {
	title: "Components/PromptCountries",
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
			<PromptCountryInfo market={germany} overridden support={selfHostedMarketSupport} />
		</div>
	);
}

/**
 * The prompt page's country control names the country like a filter would, and
 * opens to whose setting it is, the prompt's language, and which tracked models
 * can't answer from there.
 */
export const Country: StoryObj = {
	render: () => <Controls />,
	play: async ({ canvasElement }) => {
		await userEvent.click(within(canvasElement).getByRole("button", { name: "Country: Germany" }));
		const page = within(document.body);
		await expect(await page.findByText("Set on This Prompt")).toBeVisible();
		await expect(page.getByText("Written in German.")).toBeVisible();
		await expect(page.getByText(/3 of 4 models run prompts asked from Germany/)).toBeVisible();
	},
};

/** The variants menu lists every wording of the question with the country and language each is asked in. */
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
