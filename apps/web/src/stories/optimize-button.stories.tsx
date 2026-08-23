import type { Meta, StoryObj } from "@storybook/react";
import { OptimizeButton } from "@workspace/whitelabel/components/optimize-button";
import { expect, fn, userEvent, within } from "storybook/test";

const meta = {
	title: "Whitelabel/OptimizeButton",
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

const PROPS = {
	brandId: "mock-brand-id",
	promptId: "mock-prompt-id",
	promptName: "best crm for startups",
	parentName: "Acme",
	optimizationUrlTemplate: "https://acme.example/optimize?prompt={prompt}&brand={brandId}",
	availableModels: ["openai", "perplexity"],
	lookback: "1m",
} as const;

/** One model selected: a plain button that hands straight off to the parent app. */
export const SingleModel: Story = {
	render: () => (
		<div className="p-8">
			<OptimizeButton {...PROPS} selectedModel="openai" />
		</div>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const open = fn();
		window.open = open;

		await userEvent.click(await canvas.findByRole("button", { name: /optimize with acme/i }));
		await expect(open).toHaveBeenCalledWith(
			expect.stringContaining("brand=mock-brand-id"),
			"_blank",
			"noopener,noreferrer",
		);
	},
};

/**
 * "All models" opens a menu with one entry per model. Each entry carries a menu
 * group label, and a label rendered outside a group takes the whole menu down
 * rather than just itself — so this asserts the entries are reachable and still
 * hand off, not that the labels read a particular way.
 */
export const AllModelsMenu: Story = {
	render: () => (
		<div className="p-8">
			<OptimizeButton {...PROPS} selectedModel="all" />
		</div>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const open = fn();
		window.open = open;

		await userEvent.click(await canvas.findByRole("button", { name: /optimize with acme/i }));

		// The menu portals out of the canvas, so query the whole document.
		const screen = within(document.body);
		const items = await screen.findAllByRole("menuitem");
		await expect(items).toHaveLength(PROPS.availableModels.length);

		await userEvent.click(items[0]);
		await expect(open).toHaveBeenCalledWith(
			expect.stringContaining("brand=mock-brand-id"),
			"_blank",
			"noopener,noreferrer",
		);
	},
};
