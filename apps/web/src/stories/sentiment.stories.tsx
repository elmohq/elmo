import type { Meta, StoryObj } from "@storybook/react";
import { getModelMeta } from "@workspace/config/models";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import type { ComponentType, ReactNode } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { Route } from "@/routes/_authed/app/org/$org/brand/$brand/sentiment";

// The route file exports only `Route` (route files must, for code-splitting).
// Render its component via the route options — the mock exposes `options`.
const SentimentPage = (Route as unknown as { options: { component: ComponentType } }).options.component;

import { setMockBrandSentiment, setMockLandscape } from "./_mocks/server-analysis";
import { setMockBrand } from "./_mocks/use-brands";
import { mockBrandSentiment, mockLandscape } from "./analytics-fixtures";

const onboardedBrand = {
	id: "brand-1",
	name: "Acme",
	website: "https://acme.com",
	onboarded: true,
	enabled: true,
	prompts: [{ id: "p1", value: "best crm", enabled: true }],
	effectiveModels: ["gpt-4o", "claude-3-5-sonnet", "gemini-1.5-pro"],
	earliestDataDate: "2026-05-05",
	delayOverrideHours: 24,
};

function Shell({ children }: { children: ReactNode }) {
	return (
		<TooltipProvider>
			<div className="bg-background text-foreground antialiased flex min-h-svh flex-col">
				<div className="flex flex-1 flex-col">
					<div className="@container/main flex flex-1 flex-col gap-2">
						<div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">{children}</div>
					</div>
				</div>
			</div>
		</TooltipProvider>
	);
}

const meta = {
	title: "Pages/Sentiment",
	component: SentimentPage,
	parameters: { layout: "fullscreen" },
	decorators: [
		(Story) => {
			setMockBrand(onboardedBrand);
			setMockBrandSentiment(mockBrandSentiment);
			setMockLandscape(mockLandscape);
			return (
				<Shell>
					<Story />
				</Shell>
			);
		},
	],
} satisfies Meta<typeof SentimentPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** A long field of competitors scrolls within its card rather than stretching the page. */
export const ManyCompetitors: Story = {
	decorators: [
		(Story) => {
			const [brand, ...competitors] = mockLandscape.companies;
			const filler = Array.from({ length: 60 }, (_, i) => {
				const template = competitors[i % competitors.length];
				return { ...template, name: `${template.name} ${Math.floor(i / competitors.length) + 2}` };
			});
			setMockLandscape({ ...mockLandscape, companies: [brand, ...competitors, ...filler] });
			return <Story />;
		},
	],
};

/** A model's column header re-sorts the companies by that model's figure; a second click flips the order. */
export const SortByModel: Story = {
	play: async ({ canvasElement }) => {
		const model = mockLandscape.models[0];
		const header = await within(canvasElement).findByRole("button", { name: `Sort by ${getModelMeta(model).label}` });
		const table = header.closest("table") as HTMLTableElement;
		const column = Array.from(table.tHead?.rows[0].cells ?? [], (cell) => cell.textContent?.trim()).indexOf("Company");
		const companies = () => Array.from(table.tBodies[0].rows, (row) => row.cells[column].textContent?.trim());
		const bestFirst = [...mockLandscape.companies]
			.sort((a, b) => b.byModel[model].sentiment - a.byModel[model].sentiment)
			.map((c) => c.name);

		await expect(companies()).not.toEqual(bestFirst);
		await userEvent.click(header);
		await waitFor(() => expect(companies()).toEqual(bestFirst));
		await expect(header.closest("th")).toHaveAttribute("aria-sort", "descending");

		await userEvent.click(header);
		await waitFor(() => expect(companies()).toEqual([...bestFirst].reverse()));
		await expect(header.closest("th")).toHaveAttribute("aria-sort", "ascending");
	},
};

/** Quotes open on praise, with mixed and criticism a tab away. */
export const QuotesBySide: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const tabs = await canvas.findAllByRole("tab");
		await expect(tabs.map((tab) => tab.textContent)).toEqual(["praise", "mixed", "criticism"]);
		await expect(tabs[0]).toHaveAttribute("aria-selected", "true");
		await expect(canvas.getByText(/easiest CRM to get running/)).toBeInTheDocument();

		await userEvent.click(tabs[1]);
		await waitFor(() => expect(canvas.getByText(/easier to learn/)).toBeInTheDocument());
		await expect(canvas.queryByText(/raised prices twice/)).not.toBeInTheDocument();

		await userEvent.click(tabs[2]);
		await waitFor(() => expect(canvas.getByText(/raised prices twice/)).toBeInTheDocument());
		await expect(canvas.queryByText(/easier to learn/)).not.toBeInTheDocument();
	},
};
