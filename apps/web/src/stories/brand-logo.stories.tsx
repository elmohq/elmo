/**
 * BrandLogo — the mark shown beside a brand, competitor, or cited domain.
 *
 * The logos themselves come from a third-party icon service, so the gallery
 * needs network access to look right; the fallback story does not.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "storybook/test";
import { BrandLogo, type BrandLogoSize } from "@/components/brand-logo";

const meta = {
	title: "Components/Brand Logo",
	component: BrandLogo,
} satisfies Meta<typeof BrandLogo>;

export default meta;

type Story = StoryObj<typeof meta>;

const SIZES: BrandLogoSize[] = ["xs", "sm", "md", "lg"];

export const Sizes: Story = {
	args: { name: "Nike", domain: "nike.com" },
	render: (args) => (
		<div className="flex items-center gap-6 p-8">
			{SIZES.map((size) => (
				<div key={size} className="flex flex-col items-center gap-2">
					<BrandLogo {...args} size={size} />
					<span className="text-xs text-muted-foreground">{size}</span>
				</div>
			))}
		</div>
	),
};

export const Subjects: Story = {
	args: { name: "Nike", domain: "nike.com" },
	render: () => (
		<div className="flex flex-col gap-3 p-8">
			{[
				{ name: "Nike", domain: "https://www.nike.com/golf" },
				{ name: "The New York Times", domain: "nytimes.com" },
				{ name: "reddit.com", domain: "reddit.com" },
			].map((subject) => (
				<div key={subject.name} className="flex items-center gap-2 text-sm">
					<BrandLogo name={subject.name} domain={subject.domain} size="lg" />
					{subject.name}
				</div>
			))}
		</div>
	),
};

/** A competitor with no domain yet still gets a mark — its initials. */
export const FallsBackToInitials: Story = {
	args: { name: "Acme Corp", domain: null, size: "lg" },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getByText("AC")).toBeVisible();
	},
};
