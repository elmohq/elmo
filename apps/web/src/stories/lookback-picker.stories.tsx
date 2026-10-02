/**
 * Date range filter: the preset lookbacks plus a custom range picked with a
 * start and an end date picker. The custom range is written to the same
 * `?lookback=` URL key as the presets (`YYYY-MM-DD..YYYY-MM-DD`), so the
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

const dayButton = (region: HTMLElement, label: RegExp) => within(region).getByRole("button", { name: label });

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

/** "Custom range…" swaps the preset list for start and end date pickers. */
export const CustomRange: Story = {
	render: () => <ControlledPicker initial="2025-03-01..2025-03-31" />,
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole("button", { name: /Mar 1\s–\s31, 2025/ }));

		// An active custom range reopens straight onto the pickers.
		const start = await screen.findByRole("region", { name: "Start date" });
		const end = screen.getByRole("region", { name: "End date" });

		await userEvent.click(dayButton(start, /March 3rd, 2025/));
		await userEvent.click(dayButton(end, /March 14th, 2025/));
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
		const start = await screen.findByRole("region", { name: "Start date" });
		const end = screen.getByRole("region", { name: "End date" });

		await expect(dayButton(start, /March 21st, 2025/)).toBeDisabled();
		await expect(dayButton(end, /March 9th, 2025/)).toBeDisabled();
		await expect(dayButton(start, /March 5th, 2025/)).toBeEnabled();
		await expect(dayButton(end, /March 25th, 2025/)).toBeEnabled();
	},
};

/** Switching from a preset to a custom range starts with no dates picked, so
 *  Apply stays disabled until both ends are chosen. */
export const CustomRangeFromPreset: Story = {
	render: () => <ControlledPicker initial="1w" />,
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole("button", { name: /Last 7 days/ }));
		await userEvent.click(await screen.findByRole("option", { name: /Custom range/ }));

		const apply = screen.getByRole("button", { name: "Apply" });
		await expect(apply).toBeDisabled();

		const start = screen.getByRole("region", { name: "Start date" });
		const end = screen.getByRole("region", { name: "End date" });
		await userEvent.click(within(start).getAllByRole("button", { name: /1st,/ })[0]);
		await userEvent.click(within(end).getByRole("button", { name: /^Today,/ }));
		await userEvent.click(apply);

		await expect(canvas.getByTestId("value")).toHaveTextContent(/^\d{4}-\d{2}-01\.\.\d{4}-\d{2}-\d{2}$/);
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
		const start = await screen.findByRole("region", { name: "Start date" });
		await userEvent.click(dayButton(start, /January 1st, 2025/));
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

		const start = await screen.findByRole("region", { name: "Start date" });
		const end = screen.getByRole("region", { name: "End date" });
		await userEvent.click(within(start).getAllByRole("button", { name: /1st,/ })[0]);
		await userEvent.click(within(end).getByRole("button", { name: /^Today,/ }));
		await userEvent.click(screen.getByRole("button", { name: "Apply" }));

		await waitFor(() => expect(String(getMockSearch().lookback)).toMatch(/^\d{4}-\d{2}-01\.\.\d{4}-\d{2}-\d{2}$/));
		await expect(canvas.getByRole("button", { name: /^Custom range: / })).toBeVisible();
	},
};
