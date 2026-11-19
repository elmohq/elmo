import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "storybook/test";
import { CountryLabel } from "@/components/country-picker";
import { PromptVariantsMenu } from "@/components/prompt-variants";

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
			<CountryLabel country={germany.country} className="mr-1.5 text-sm" />
			<PromptVariantsMenu promptId="2" variants={VARIANTS} />
		</div>
	);
}

/** The prompt page says where the prompt is asked from, and the one menu beside it switches between its variants. */
export const Variants: StoryObj = {
	render: () => <Controls />,
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getByText("Germany")).toBeVisible();
		await userEvent.click(canvas.getByRole("button", { name: /Variants/ }));
		const page = within(document.body);
		await expect(await page.findByRole("menuitemradio", { name: /welches CRM für Start-ups/ })).toHaveAttribute(
			"aria-checked",
			"true",
		);
		await expect(page.getByRole("menuitemradio", { name: /meilleur CRM pour PME.*French.*Disabled/ })).toBeVisible();
	},
};
