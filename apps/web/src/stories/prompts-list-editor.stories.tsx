import type { Meta, StoryObj } from "@storybook/react";
import { MAX_PROMPTS } from "@workspace/lib/constants";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import {
	type EditablePrompt,
	newPromptEntry,
	type PromptEditorCapacity,
	PromptsListEditor,
} from "@/components/prompts-list-editor";

const meta = {
	title: "Components/PromptsListEditor",
} satisfies Meta;

export default meta;

/** The table layout is `hidden md:grid` — widen the canvas past 768px to see it. */
function Harness({
	initial,
	showSystemTags = true,
	capacity,
}: {
	initial: EditablePrompt[];
	showSystemTags?: boolean;
	capacity?: PromptEditorCapacity;
}) {
	const [prompts, setPrompts] = useState(initial);

	return (
		<div className="p-8">
			<PromptsListEditor prompts={prompts} onChange={setPrompts} showSystemTags={showSystemTags} capacity={capacity} />
		</div>
	);
}

const entries = (values: string[], partial?: Partial<EditablePrompt>) =>
	values.map((value) => newPromptEntry({ value, ...partial }));

const filler = (count: number) => entries(Array.from({ length: count }, (_, i) => `best running shoes option ${i}`));

/** Opens the bulk panel and pastes `text` into it. */
const addMultiple =
	(text: string) =>
	async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole("button", { name: /add multiple/i }));
		await userEvent.click(canvas.getByLabelText("Prompts to add, one per line"));
		await userEvent.paste(text);
	};

export const Populated = () => (
	<Harness
		initial={[
			...entries(["best running shoes for flat feet"], { tags: ["footwear"], systemTags: ["unbranded"] }),
			...entries(["is nike better than adidas"], { tags: ["comparison"], systemTags: ["branded"] }),
			...entries(["most durable trail runners"], { enabled: false, systemTags: ["unbranded"] }),
		]}
	/>
);

/**
 * A paste into a non-empty list carrying every skip reason at once: two blank
 * lines, a repeat of an existing prompt (differing only in case and spacing),
 * and a line repeated within the paste. Two survive, and the notice accounts
 * for all four dropped lines.
 */
export const AddMultiple: StoryObj = {
	render: () => <Harness initial={entries(["best running shoes for flat feet", "most durable trail runners"])} />,
	play: async (ctx) => {
		await addMultiple(
			"trail shoes for wide feet\n\nBest  Running   Shoes For Flat Feet\n   \nbest marathon racing flats\ntrail shoes for wide feet",
		)(ctx);
		const canvas = within(ctx.canvasElement);
		await expect(canvas.getByRole("button", { name: /^add 2 prompts$/i })).toBeEnabled();
		await expect(canvas.getByText("Skipped 2 duplicates and 2 blank lines.")).toBeVisible();
	},
};

/**
 * 95 filled prompts plus 5 blank rows, so there is room for exactly 5 more —
 * blank rows fill the table but don't hold prompt slots. Pasting 6 lines puts
 * the paste over the limit, which blocks it outright rather than taking the 5
 * that fit.
 */
export const AddMultipleOverCapacity: StoryObj = {
	render: () => (
		<Harness showSystemTags={false} initial={[...filler(MAX_PROMPTS - 5), ...entries(["", "", "", "", ""])]} />
	),
	play: async (ctx) => {
		await addMultiple(
			"trail shoes for wide feet\nbest marathon racing flats\nlightweight gym trainers\nbest shoes for plantar fasciitis\ncushioned recovery runners\nzero drop road shoes",
		)(ctx);
		const canvas = within(ctx.canvasElement);
		await expect(canvas.getByRole("button", { name: /^add 5 prompts$/i })).toBeDisabled();
		await expect(canvas.getByRole("alert")).toHaveTextContent(
			`This paste is 1 prompt over the ${MAX_PROMPTS} limit. Remove a line to continue.`,
		);
	},
};

/** At the cap: both toolbar buttons are hidden and the limit message shows. */
export const AtCapacity = () => <Harness showSystemTags={false} initial={filler(MAX_PROMPTS)} />;

/** Cloud capacity counts enabled prompts across brands and has no 100-row editor ceiling. */
export const CloudAboveLegacyRowLimit: StoryObj = {
	render: () => (
		<Harness
			showSystemTags={false}
			initial={filler(MAX_PROMPTS + 1)}
			capacity={{ scope: "organization-enabled", limit: 150, usedOutsideEditor: 10 }}
		/>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getByText("111/150")).toBeVisible();
		await expect(canvas.getByRole("button", { name: /add prompt/i })).toBeEnabled();
	},
};

/** At the organization limit, another row can be staged but starts disabled. */
export const CloudAtEnabledCapacity: StoryObj = {
	render: () => (
		<Harness
			showSystemTags={false}
			initial={entries(["best trail shoes", "best road shoes"])}
			capacity={{ scope: "organization-enabled", limit: 3, usedOutsideEditor: 1 }}
		/>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getByText("3/3")).toBeVisible();
		await userEvent.click(canvas.getByRole("button", { name: /add prompt/i }));
		const enableSwitches = canvas.getAllByRole("switch", { name: /enable prompt/i });
		await expect(enableSwitches.at(-1)).toBeDisabled();
	},
};
