/**
 * BrandLogo — the mark shown beside a brand, competitor, or cited domain.
 *
 * The icons themselves come from a third-party service, so the galleries need
 * network access to look right; the fallback story does not.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { expect, waitFor, within } from "storybook/test";
import { BrandLogo, type BrandLogoSize } from "@/components/brand-logo";

const meta = {
	title: "Components/Brand Logo",
	component: BrandLogo,
} satisfies Meta<typeof BrandLogo>;

export default meta;

type Story = StoryObj<typeof meta>;

const SIZES: BrandLogoSize[] = ["xs", "sm", "md", "lg"];

export const Sizes: Story = {
	args: { domain: "nike.com" },
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
	args: { domain: "nike.com" },
	render: () => (
		<div className="flex flex-col gap-3 p-8">
			{[
				{ name: "Nike", domain: "https://www.nike.com/golf" },
				{ name: "The New York Times", domain: "nytimes.com" },
				{ name: "reddit.com", domain: "reddit.com" },
			].map((subject) => (
				<div key={subject.name} className="flex items-center gap-2 text-sm">
					<BrandLogo domain={subject.domain} size="lg" />
					{subject.name}
				</div>
			))}
		</div>
	),
};

/**
 * The three ways an icon can be absent, side by side: no domain set, a domain
 * the favicon service has no icon for, and a domain that doesn't resolve. All
 * three should land on the same glyph.
 */
export const MissingIcons: Story = {
	args: { domain: null, size: "lg" },
	render: () => (
		<div className="flex flex-col gap-3 p-8">
			{[
				{ label: "has an icon", domain: "stripe.com" },
				{ label: "no domain set", domain: null },
				{ label: "no icon for the site", domain: "growwithless.com" },
				{ label: "domain doesn't resolve", domain: "example.invalid" },
			].map((subject) => (
				<div key={subject.label} className="flex items-center gap-2 text-sm">
					<BrandLogo domain={subject.domain} size="lg" />
					{subject.label}
				</div>
			))}
		</div>
	),
};

/** A competitor with no domain yet still gets a mark. */
export const FallsBackToGlyph: Story = {
	args: { domain: null, size: "lg" },
	play: async ({ canvasElement }) => {
		await waitFor(() => expect(canvasElement.querySelector("svg")).toBeVisible());
	},
};
