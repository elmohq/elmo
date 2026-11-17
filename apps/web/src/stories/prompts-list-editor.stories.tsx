import type { Meta, StoryObj } from "@storybook/react";
import { MAX_PROMPTS } from "@workspace/lib/constants";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import {
	type EditablePrompt,
	newPromptEntry,
	type PremiumAllowance,
	type PromptLocales,
	PromptsListEditor,
} from "@/components/prompts-list-editor";
import type { MarketSupport } from "@/lib/market-support";
import { planMarketSupport, selfHostedMarketSupport } from "./_mocks/market-support";
import { translatePromptsFn } from "./_mocks/server-prompt-translation";

const meta = {
	title: "Components/PromptsListEditor",
} satisfies Meta;

export default meta;

/** The table layout is `hidden md:grid` — widen the canvas past 768px to see it. */
function Harness({
	initial,
	showSystemTags = true,
	premium,
	variants,
	locales,
}: {
	initial: EditablePrompt[];
	showSystemTags?: boolean;
	premium?: PremiumAllowance;
	variants?: boolean;
	locales?: PromptLocales;
}) {
	const [prompts, setPrompts] = useState(initial);

	return (
		<div className="p-8">
			<PromptsListEditor
				prompts={prompts}
				onChange={setPrompts}
				showSystemTags={showSystemTags}
				premium={premium}
				variants={variants}
				locales={locales}
			/>
		</div>
	);
}

const entries = (values: string[], partial?: Partial<EditablePrompt>) =>
	values.map((value) => newPromptEntry({ value, ...partial }));

const filler = (count: number) => entries(Array.from({ length: count }, (_, i) => `best running shoes option ${i}`));

const pasteIntoBulkPanel =
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
		await pasteIntoBulkPanel(
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
		await pasteIntoBulkPanel(
			"trail shoes for wide feet\nbest marathon racing flats\nlightweight gym trainers\nbest shoes for plantar fasciitis\ncushioned recovery runners\nzero drop road shoes",
		)(ctx);
		const canvas = within(ctx.canvasElement);
		await expect(canvas.getByRole("button", { name: /^add 5 prompts$/i })).toBeDisabled();
		await expect(canvas.getByRole("alert")).toHaveTextContent(
			`This paste is 1 prompt over the ${MAX_PROMPTS} limit. Remove a line to continue.`,
		);
	},
};

export const RemoveUnsavedRow: StoryObj = {
	render: () => (
		<Harness
			initial={[
				...entries(["best running shoes for flat feet"], { id: "saved-1" }),
				...entries(["trail shoes for wide feet"], { suggested: true }),
			]}
		/>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.queryAllByRole("button", { name: 'Remove "best running shoes for flat feet"' })).toHaveLength(
			0,
		);
		await userEvent.click(canvas.getAllByRole("button", { name: 'Remove "trail shoes for wide feet"' })[0]!);
		await expect(canvas.queryAllByDisplayValue("trail shoes for wide feet")).toHaveLength(0);
	},
};

/**
 * A variant lands under the prompt it rewords, below the variants already
 * there, and the count line says it is tracked as a prompt of its own.
 */
export const Variants: StoryObj = {
	render: () => (
		<Harness
			variants
			initial={[
				...entries(["best crm for small business"], { id: "crm", groupId: "crm-group", tags: ["crm"] }),
				...entries(["which crm should a startup use"], { id: "crm-2", groupId: "crm-group", tags: ["crm"] }),
				...entries(["cheapest project management tool"], { id: "pm" }),
			]}
		/>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText(/including 1 variant\./)).toBeVisible();

		await userEvent.click(
			canvas.getAllByRole("button", { name: 'Add a variant of "best crm for small business"' })[0]!,
		);
		const added = canvas.getAllByRole("textbox", { name: 'Variant of "best crm for small business"' });
		await userEvent.type(added.at(-1)!, "top crm tools for small teams");

		// Each row renders twice, once per layout, so every prompt appears as a pair.
		const promptTexts = canvas
			.getAllByRole("textbox")
			.map((input) => (input as HTMLInputElement).value)
			.filter((value) => value.includes("crm") || value.includes("project"));
		await expect(promptTexts.filter((_, index) => index % 2 === 0)).toEqual([
			"best crm for small business",
			"which crm should a startup use",
			"top crm tools for small teams",
			"cheapest project management tool",
		]);
		await expect(await canvas.findByText(/including 2 variants\./)).toBeVisible();
	},
};

const localesFor = (support: MarketSupport): PromptLocales => ({
	support,
	translate: (market, texts) => translatePromptsFn({ data: { market, texts } }),
});

const MARKET_PROMPTS = [
	...entries(["best crm for small business"], { id: "crm", groupId: "crm-group", tags: ["crm"] }),
	...entries(["bestes CRM für kleine Unternehmen"], {
		id: "crm-de",
		groupId: "crm-group",
		tags: ["crm"],
		country: "DE",
		language: "de",
	}),
	...entries(["cheapest project management tool"], { id: "pm" }),
];

/**
 * Self-hosted: the note above the list prices one prompt, a prompt with its own
 * country says so in the Country column, and a country some models can't answer
 * from carries a warning.
 */
export const Countries: StoryObj = {
	render: () => <Harness variants locales={localesFor(selfHostedMarketSupport)} initial={MARKET_PROMPTS} />,
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText(/roughly \$0\.90 a month at estimated provider prices/)).toBeVisible();
		await expect(canvas.getAllByRole("button", { name: "Country: brand default, United States" })).not.toHaveLength(0);
		await expect(canvas.getAllByRole("button", { name: "Country: Germany" })).not.toHaveLength(0);
	},
};

/**
 * Translating for two countries adds two drafts under the prompt, each set to
 * its country and language, after the dialog has said what they add to the bill.
 */
export const TranslateForCountries: StoryObj = {
	render: () => <Harness variants locales={localesFor(selfHostedMarketSupport)} initial={MARKET_PROMPTS} />,
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const page = within(document.body);
		await userEvent.click(canvas.getAllByRole("button", { name: 'Translate "best crm for small business"' })[0]!);

		const dialog = within(await page.findByRole("dialog"));
		// Germany · German already has a variant of this question.
		await expect(dialog.getByRole("option", { name: /Germany · German.*Already tracked/ })).toHaveAttribute(
			"aria-disabled",
			"true",
		);
		await userEvent.click(dialog.getByRole("option", { name: /France · French/ }));
		await userEvent.click(dialog.getByRole("option", { name: /Japan · Japanese/ }));
		await expect(dialog.getByText(/Adds/)).toHaveTextContent(
			"Adds 2 prompts, each tracked on its own: 6 provider calls a day, roughly $1.50 a month at estimated provider prices.",
		);
		await userEvent.click(dialog.getByRole("button", { name: "Add 2 Prompts" }));

		await expect(await canvas.findAllByDisplayValue("best crm for small business (fr-FR)")).not.toHaveLength(0);
		await expect(canvas.getAllByDisplayValue("best crm for small business (ja-JP)")).not.toHaveLength(0);
		await expect(canvas.getAllByRole("button", { name: "Country: France" })).not.toHaveLength(0);
		await expect(await canvas.findByText(/including 3 variants\./)).toBeVisible();
	},
};

/**
 * Before a country is chosen, the picker says which tracked models can't answer
 * from it and what a prompt there costs. A prompt's language is a second field
 * in the same menu, changed without touching its country.
 */
export const CountryPickerExplainsACountry: StoryObj = {
	render: () => <Harness variants locales={localesFor(selfHostedMarketSupport)} initial={MARKET_PROMPTS} />,
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const page = within(document.body);
		await userEvent.click(canvas.getAllByRole("button", { name: "Country: Germany" }).at(-1)!);

		await expect(await page.findByText(/3 of 4 models run prompts asked from Germany/)).toBeVisible();
		await expect(
			page.getByText(/One prompt here runs on 3 models: 3 provider calls a day, roughly \$0\.75 a month/),
		).toBeVisible();

		await userEvent.click(page.getByRole("combobox", { name: "Language" }));
		await userEvent.click(await page.findByRole("option", { name: "French" }));
		await userEvent.keyboard("{Escape}");
		await expect(canvas.getAllByRole("button", { name: "Country: Germany" })).not.toHaveLength(0);
	},
};

/**
 * Translating a selection adds one prompt per question and country: a prompt
 * selected along with its own variant is translated once, not once from each.
 */
export const TranslateSelectionOncePerQuestion: StoryObj = {
	render: () => <Harness variants locales={localesFor(selfHostedMarketSupport)} initial={MARKET_PROMPTS} />,
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const page = within(document.body);
		await userEvent.click(canvas.getByRole("checkbox", { name: "Select all prompts" }));
		await userEvent.click(canvas.getByRole("button", { name: "Translate" }));

		const dialog = within(await page.findByRole("dialog"));
		await userEvent.click(dialog.getByRole("option", { name: /France · French/ }));
		await expect(dialog.getByText(/Adds/)).toHaveTextContent(/^Adds 2 prompts,/);
	},
};

/** Cloud: no prices, so the note and the dialog count prompts against the plan instead. */
export const CountriesOnAPlan: StoryObj = {
	render: () => <Harness variants locales={localesFor(planMarketSupport)} initial={MARKET_PROMPTS} />,
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText(/uses 1 of your plan's 100 prompts \(42 in use\)/)).toBeVisible();
	},
};

/** At the cap: both toolbar buttons are hidden and the limit message shows. */
export const AtCapacity = () => <Harness showSystemTags={false} initial={filler(MAX_PROMPTS)} />;

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
