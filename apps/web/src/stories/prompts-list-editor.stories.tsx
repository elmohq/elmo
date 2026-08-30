import type { Meta, StoryObj } from "@storybook/react";
import { MAX_PROMPTS } from "@workspace/lib/constants";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import {
	type EditablePrompt,
	newPromptEntry,
	type PremiumAllowance,
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
	premium,
}: {
	initial: EditablePrompt[];
	showSystemTags?: boolean;
	premium?: PremiumAllowance;
}) {
	const [prompts, setPrompts] = useState(initial);

	return (
		<div className="p-8">
			<PromptsListEditor prompts={prompts} onChange={setPrompts} showSystemTags={showSystemTags} premium={premium} />
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

// ---------------------------------------------------------------------------
// Web-grounded Claude assignment (cloud plans)
// ---------------------------------------------------------------------------

/**
 * The stacked mobile block and the desktop grid both render, so every row has
 * two of these. Queries go through the state rather than an index so they don't
 * depend on which layout the canvas width happens to show.
 */
/**
 * Each row opens a popover naming the premium models, so the assertions below
 * work through it the way a customer would rather than reaching for a checkbox
 * the table no longer shows.
 */
// The mobile block and the desktop grid both render (one is just hidden), so a
// row has two triggers. Selecting by what the trigger says avoids depending on
// which layout comes first in the DOM.
const premiumTrigger = async (canvasElement: HTMLElement, says: RegExp) =>
	(await within(canvasElement).findAllByRole("button", { name: says }))[0];

/** The popover renders in a portal, so its contents are not inside the canvas. */
const premiumOption = (model: RegExp) => within(document.body).findByRole("button", { name: model });

async function openPremium(canvasElement: HTMLElement, says: RegExp) {
	await userEvent.click(await premiumTrigger(canvasElement, says));
}

export const PremiumColumn: StoryObj = {
	render: () => (
		<Harness
			premium={{ total: 20, assignedElsewhere: 4 }}
			initial={[
				...entries(["best crm for small business"], { premiumModels: ["claude"] }),
				...entries(["cheapest project management tool"]),
				...entries(["alternatives to salesforce"]),
			]}
		/>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		// 4 elsewhere + 1 spent here.
		await expect(await canvas.findByText("5 of 20")).toBeVisible();

		await openPremium(canvasElement, /premium models: none/i);
		await userEvent.click(await premiumOption(/^Claude/));
		await expect(await canvas.findByText("6 of 20")).toBeVisible();
	},
};

/**
 * The pool is spent per prompt/model pair, so tracking one prompt on a second
 * model costs a second slot — that is what makes it a premium budget rather
 * than a per-prompt flag.
 */
export const PremiumSpendsASlotPerModel: StoryObj = {
	render: () => (
		<Harness
			premium={{ total: 20, assignedElsewhere: 0 }}
			initial={entries(["best crm for small business"], { premiumModels: ["claude"] })}
		/>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText("1 of 20")).toBeVisible();

		await openPremium(canvasElement, /premium models: claude/i);
		await userEvent.click(await premiumOption(/^Grok/));
		await expect(await canvas.findByText("2 of 20")).toBeVisible();
	},
};

/**
 * A full allowance leaves spent pairs switchable but blocks new ones before a
 * save, rather than letting the server reject it.
 */
export const PremiumAtCapacity: StoryObj = {
	render: () => (
		<Harness
			premium={{ total: 5, assignedElsewhere: 4 }}
			initial={[
				...entries(["best crm for small business"], { premiumModels: ["claude"] }),
				...entries(["cheapest project management tool"]),
			]}
		/>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText("5 of 5")).toBeVisible();
		await expect(await canvas.findByText(/unassign one to free it up/i)).toBeVisible();
		// Buying more is a link to billing rather than an instruction to go find it.
		// The router mock renders Link as a button, hence the role.
		await expect((await canvas.findAllByRole("button", { name: /buy more/i })).length).toBeGreaterThan(0);

		// The model already spending a slot can be given back; the rest cannot be added.
		await openPremium(canvasElement, /premium models: claude/i);
		await expect(await premiumOption(/^Claude/)).toBeEnabled();
		await expect(await premiumOption(/^Grok/)).toBeDisabled();
	},
};

/** A disabled prompt runs nothing, so it cannot hold an allowance either. */
export const PremiumIgnoresDisabledPrompts: StoryObj = {
	render: () => (
		<Harness
			premium={{ total: 20, assignedElsewhere: 0 }}
			initial={entries(["most durable trail runners"], { enabled: false })}
		/>
	),
	play: async ({ canvasElement }) => {
		await expect(await premiumTrigger(canvasElement, /premium models: none/i)).toBeDisabled();
	},
};

/** Without an allowance the column is absent — self-hosted, or a plan with none. */
export const NoPremiumColumn: StoryObj = {
	render: () => <Harness initial={entries(["best crm for small business"])} />,
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.queryByRole("button", { name: /premium models:/i })).toBeNull();
		await expect(canvas.queryByText(/pairings in use/i)).toBeNull();
	},
};
