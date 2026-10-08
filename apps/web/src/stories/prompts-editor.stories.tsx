import type { Meta, StoryObj } from "@storybook/react";
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar";
import { expect, userEvent, within } from "storybook/test";
import { PromptsEditor } from "@/components/prompts-editor";
import {
	setMockPromptSuggestions,
	setMockPromptSuggestionsDelay,
	setMockPromptSuggestionsRemaining,
	setMockPromptSuggestionsStartError,
} from "./_mocks/server-prompt-suggestions";

const prompts = Array.from({ length: 24 }, (_, i) => ({
	id: `prompt-${i}`,
	value: `What are the best AI visibility tools for ${["agencies", "startups", "enterprises", "ecommerce"][i % 4]}? (${i + 1})`,
	enabled: i % 5 !== 0,
	tags: i % 3 === 0 ? ["comparison"] : [],
	systemTags: i % 2 === 0 ? ["unbranded"] : ["branded"],
}));

const meta = {
	title: "Pages/PromptsEditor",
	component: PromptsEditor,
	parameters: { layout: "fullscreen" },
	decorators: [
		(Story) => (
			<SidebarProvider>
				<div className="w-64 shrink-0 bg-sidebar" />
				<SidebarInset className="md:border md:border-border/60 md:rounded-xl overflow-clip">
					<header className="bg-background sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b px-4">
						Mock header
					</header>
					<div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
						<Story />
					</div>
				</SidebarInset>
			</SidebarProvider>
		),
	],
} satisfies Meta<typeof PromptsEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	render: (args) => {
		mockSuggestions();
		return <PromptsEditor {...args} />;
	},
	args: {
		initialPrompts: prompts,
		brandId: "mock-brand-id",
		pageTitle: "Prompts",
		pageDescription: "Add, edit, or remove your brand tracking keywords and prompts",
	},
};

const SUGGESTIONS = [
	{ prompt: "ai visibility tools for b2b saas", tags: ["saas"] },
	{ prompt: "how to track brand mentions in chatgpt", tags: ["tracking"] },
	{ prompt: "chatgpt rank tracker for agencies", tags: ["agencies"] },
	{ prompt: "how do i get my brand cited by perplexity", tags: [] },
	{ prompt: "answer engine optimization software pricing", tags: ["pricing"] },
];

/** Sets what a suggestion run returns. Called during render: the run starts
 *  from a click, after the story has mounted. */
function mockSuggestions({
	delayMs = 0,
	startError = null,
	remaining = 4,
}: {
	delayMs?: number;
	startError?: string | null;
	remaining?: number;
} = {}) {
	setMockPromptSuggestions(SUGGESTIONS);
	setMockPromptSuggestionsDelay(delayMs);
	setMockPromptSuggestionsStartError(startError);
	setMockPromptSuggestionsRemaining(remaining);
}

/**
 * Suggestions arrive ticked. Passing on one and adding the rest puts them at
 * the top of the list as unsaved rows, for the save bar to persist.
 */
export const SuggestPrompts: Story = {
	args: Default.args,
	render: (args) => {
		mockSuggestions();
		return <PromptsEditor {...args} />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole("button", { name: /suggest prompts/i }));

		await canvas.findByRole("checkbox", { name: `Include "${SUGGESTIONS[0]!.prompt}"` });
		await expect(canvas.getByText("4 of 5 runs left today")).toBeVisible();
		await userEvent.click(canvas.getByRole("checkbox", { name: `Include "${SUGGESTIONS[2]!.prompt}"` }));
		await userEvent.click(canvas.getByRole("button", { name: /^add 4 prompts$/i }));

		await expect(canvas.queryByRole("region", { name: "Suggested Prompts" })).not.toBeInTheDocument();
		await expect(canvas.getByText("4 added")).toBeVisible();
	},
};

/** While the worker is still thinking. */
export const SuggestPromptsLoading: Story = {
	args: Default.args,
	render: (args) => {
		mockSuggestions({ delayMs: 600_000 });
		return <PromptsEditor {...args} />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole("button", { name: /suggest prompts/i }));
		await expect(await canvas.findByText(/looking for prompts you don't track yet/i)).toBeVisible();
		await expect(canvas.getByRole("button", { name: /suggest prompts/i })).toBeDisabled();
	},
};

/** Out of runs for the day: the refusal says when more open up. */
export const SuggestPromptsLimitReached: Story = {
	args: Default.args,
	render: (args) => {
		mockSuggestions({
			startError: "You've used all 5 prompt suggestion runs for today. Try again in 3 hours.",
		});
		return <PromptsEditor {...args} />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole("button", { name: /suggest prompts/i }));
		await expect(await canvas.findByRole("alert")).toHaveTextContent("Try again in 3 hours.");
		await expect(canvas.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
	},
};
