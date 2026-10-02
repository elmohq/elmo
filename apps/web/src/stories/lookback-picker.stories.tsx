/**
 * Date range filter: the preset lookbacks plus independent start and end date
 * fields, each opening its own calendar (either may be left empty). The custom range is written to the same
 * `?lookback=` URL key as the presets (`YYYY-MM-DD..YYYY-MM-DD`, with an empty
 * side for an open bound), so the
 * filter-bar and prompt-detail stories assert the URL value too.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { expect, screen, userEvent, waitFor, within } from "storybook/test";
import { FilterBar, FilterTriggerButton } from "@/components/filter-bar";
import { formatLookbackLabel, LookbackPicker } from "@/components/lookback-picker";
import { LookbackSelector } from "@/components/lookback-selector";
import type { LookbackPeriod } from "@/lib/lookback";
import { getMockSearch, setMockSearch, useSearch } from "./_mocks/tanstack-router";
import { setMockBrand } from "./_mocks/use-brands";

const meta = {
	title: "Components/Lookback Picker",
	decorators: [
		(Story) => {
			setMockBrand({ id: "brand-1", name: "Acme", earliestDataDate: "2024-01-01" });
			return (
				<div className="p-8">
					<Story />
				</div>
			);
		},
	],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function ControlledPicker({ initial }: { initial: LookbackPeriod }) {
	const [value, setValue] = useState<LookbackPeriod>(initial);
	return (
		<div className="space-y-3">
			<LookbackPicker
				value={value}
				onChange={setValue}
				trigger={<FilterTriggerButton icon={null} label={formatLookbackLabel(value)} />}
			/>
			<p className="text-xs text-muted-foreground">
				value: <code data-testid="value">{value}</code>
			</p>
		</div>
	);
}

function UrlLookback() {
	const lookback = useSearch({ select: (s) => s.lookback }) as string | undefined;
	return (
		<p className="mt-3 text-xs text-muted-foreground">
			?lookback=<code data-testid="url-lookback">{lookback ?? ""}</code>
		</p>
	);
}

// Only one calendar is ever open, so day names are unambiguous across the popover.
const openField = async (label: "Start date" | "End date") =>
	userEvent.click(await screen.findByRole("button", { name: new RegExp(`^${label}:`) }));
const day = (name: RegExp) => screen.getAllByRole("button", { name })[0];

/** Picking a preset closes the popover and updates the trigger label. */
export const Presets: Story = {
	render: () => <ControlledPicker initial="1m" />,
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole("button", { name: /Last 30 days/ }));
		await userEvent.click(await screen.findByRole("option", { name: "Last 3 months" }));

		await expect(canvas.getByTestId("value")).toHaveTextContent("3m");
		await expect(canvas.getByRole("button", { name: /Last 3 months/ })).toBeVisible();
	},
};

/** "Custom range…" swaps the preset list for a start and an end date field;
 *  clicking a field opens its calendar, and picking a day closes it again. */
export const CustomRange: Story = {
	render: () => <ControlledPicker initial="2025-03-01..2025-03-31" />,
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole("button", { name: /Mar 1\s–\s31, 2025/ }));

		// An active custom range reopens straight onto the fields, both closed.
		await openField("Start date");
		await userEvent.click(day(/March 3rd, 2025/));
		await expect(screen.queryByRole("grid")).toBeNull();
		await expect(screen.getByRole("button", { name: "Start date: Mar 3, 2025" })).toBeVisible();

		await openField("End date");
		await userEvent.click(day(/March 14th, 2025/));
		await userEvent.click(screen.getByRole("button", { name: "Apply" }));

		await expect(canvas.getByTestId("value")).toHaveTextContent("2025-03-03..2025-03-14");
		await expect(canvas.getByRole("button", { name: /Mar 3\s–\s14, 2025/ })).toBeVisible();
	},
};

/** Each picker bounds the other, and neither allows a day after today. */
export const CustomRangeBounds: Story = {
	render: () => <ControlledPicker initial="2025-03-10..2025-03-20" />,
	play: async ({ canvasElement }) => {
		await userEvent.click(within(canvasElement).getByRole("button", { name: /Mar 10\s–\s20, 2025/ }));
		await openField("Start date");
		await expect(day(/March 21st, 2025/)).toBeDisabled();
		await expect(day(/March 5th, 2025/)).toBeEnabled();

		// Opening the other field swaps calendars rather than stacking a second one.
		await openField("End date");
		await expect(screen.getAllByRole("grid")).toHaveLength(1);
		await expect(day(/March 9th, 2025/)).toBeDisabled();
		await expect(day(/March 25th, 2025/)).toBeEnabled();
	},
};

/** Switching from a preset starts with both fields empty and the start
 *  calendar open; Apply needs at least one date. A start alone means "since". */
export const StartDateOnly: Story = {
	render: () => <ControlledPicker initial="1w" />,
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole("button", { name: /Last 7 days/ }));
		await userEvent.click(await screen.findByRole("option", { name: /Custom range/ }));

		const apply = screen.getByRole("button", { name: "Apply" });
		await expect(apply).toBeDisabled();

		await userEvent.click(day(/1st,/));
		await userEvent.click(apply);

		await expect(canvas.getByTestId("value")).toHaveTextContent(/^\d{4}-\d{2}-01\.\.$/);
		await expect(canvas.getByRole("button", { name: /^Since / })).toBeVisible();
	},
};

/** An end date alone means "until". */
export const EndDateOnly: Story = {
	render: () => <ControlledPicker initial="1w" />,
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole("button", { name: /Last 7 days/ }));
		await userEvent.click(await screen.findByRole("option", { name: /Custom range/ }));

		await openField("End date");
		await userEvent.click(day(/1st,/));
		await userEvent.click(screen.getByRole("button", { name: "Apply" }));

		await expect(canvas.getByTestId("value")).toHaveTextContent(/^\.\.\d{4}-\d{2}-01$/);
		await expect(canvas.getByRole("button", { name: /^Until / })).toBeVisible();
	},
};

/** Clearing one side of a range leaves the other as an open-ended bound. */
export const ClearStartDate: Story = {
	render: () => <ControlledPicker initial="2025-03-01..2025-03-31" />,
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole("button", { name: /Mar 1\s–\s31, 2025/ }));
		await userEvent.click(await screen.findByRole("button", { name: "Clear start date" }));
		await userEvent.click(screen.getByRole("button", { name: "Apply" }));

		await expect(canvas.getByTestId("value")).toHaveTextContent("..2025-03-31");
		await expect(canvas.getByRole("button", { name: /Until Mar 31, 2025/ })).toBeVisible();
	},
};

/** In the dashboard filter bar the chosen range round-trips through `?lookback=`,
 *  and a shared link with a range in it opens on that range. */
export const InFilterBar: Story = {
	render: () => {
		setMockSearch({ lookback: "2025-01-05..2025-02-10" });
		return (
			<div>
				<FilterBar availableTags={["branded"]} trackedTargets={[]} showSearch={false} showModelSelector={false} />
				<UrlLookback />
			</div>
		);
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const trigger = canvas.getByRole("button", { name: /Jan 5\s–\sFeb 10, 2025/ });

		await userEvent.click(trigger);
		await openField("Start date");
		await userEvent.click(day(/January 1st, 2025/));
		await userEvent.click(screen.getByRole("button", { name: "Apply" }));
		await waitFor(() => expect(getMockSearch().lookback).toBe("2025-01-01..2025-02-10"));
		await expect(canvas.getByTestId("url-lookback")).toHaveTextContent("2025-01-01..2025-02-10");

		// Back to a preset; the brand's default (30 days) clears the param entirely.
		await userEvent.click(canvas.getByRole("button", { name: /Jan 1\s–\sFeb 10, 2025/ }));
		await userEvent.click(await screen.findByRole("button", { name: "Back" }));
		await userEvent.click(await screen.findByRole("option", { name: "Last 30 days" }));
		await waitFor(() => expect(getMockSearch().lookback).toBeUndefined());
	},
};

/** A malformed or inverted range in a link falls back to the default lookback. */
export const InvalidRangeInUrl: Story = {
	render: () => {
		setMockSearch({ lookback: "2025-02-10..2025-01-05" });
		return <FilterBar availableTags={[]} trackedTargets={[]} showSearch={false} showModelSelector={false} />;
	},
	play: async ({ canvasElement }) => {
		await expect(within(canvasElement).getByRole("button", { name: /Last 30 days/ })).toBeVisible();
	},
};

/** The prompt-detail segmented control gets a trailing custom-range segment. */
export const PromptDetailSelector: Story = {
	render: () => {
		setMockSearch({});
		return (
			<div>
				<LookbackSelector />
				<UrlLookback />
			</div>
		);
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole("button", { name: "Custom range" }));

		await screen.findByRole("grid");
		await userEvent.click(day(/1st,/));
		await openField("End date");
		await userEvent.click(day(/^Today,/));
		await userEvent.click(screen.getByRole("button", { name: "Apply" }));

		await waitFor(() => expect(String(getMockSearch().lookback)).toMatch(/^\d{4}-\d{2}-01\.\.\d{4}-\d{2}-\d{2}$/));
		await expect(canvas.getByRole("button", { name: /^Custom range: / })).toBeVisible();
	},
};
