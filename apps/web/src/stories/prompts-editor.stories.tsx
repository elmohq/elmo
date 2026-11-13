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

const MORE_SUGGESTIONS = [
	{ prompt: "best geo tools for ecommerce brands", tags: ["ecommerce"] },
	{ prompt: "does google ai overviews mention small brands", tags: [] },
];

function mockSuggestions({
	delayMs = 0,
	startError = null,
	remaining = 4,
}: {
	delayMs?: number;
	startError?: string | null;
	remaining?: number;
} = {}) {
	setMockPromptSuggestions(SUGGESTIONS, MORE_SUGGESTIONS);
	setMockPromptSuggestionsDelay(delayMs);
	setMockPromptSuggestionsStartError(startError);
	setMockPromptSuggestionsRemaining(remaining);
}

const removeButtons = (canvas: ReturnType<typeof within>, prompt: string) =>
	canvas.queryAllByRole("button", { name: `Remove "${prompt}"` });
const findRemoveButton = async (canvas: ReturnType<typeof within>, prompt: string) =>
	(await canvas.findAllByRole("button", { name: `Remove "${prompt}"` }))[0]!;

export const SuggestPrompts: Story = {
	args: Default.args,
	render: (args) => {
		mockSuggestions();
		return <PromptsEditor {...args} />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole("button", { name: /suggest prompts/i }));

		await findRemoveButton(canvas, SUGGESTIONS[0]!.prompt);
		await expect(canvas.getByText("4 runs left today")).toBeVisible();
		await userEvent.click(await findRemoveButton(canvas, SUGGESTIONS[2]!.prompt));

		await expect(removeButtons(canvas, SUGGESTIONS[2]!.prompt)).toHaveLength(0);
		await expect(canvas.getByText(/suggested prompts below/)).toHaveTextContent("4 suggested prompts below");
		await expect(canvas.getByText("4 added")).toBeVisible();
	},
};

export const SuggestPromptsLoading: Story = {
	args: Default.args,
	render: (args) => {
		mockSuggestions({ delayMs: 600_000 });
		return <PromptsEditor {...args} />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole("button", { name: /suggest prompts/i }));
		await expect(await canvas.findByText(/suggesting prompts\. this usually takes/i)).toBeVisible();
		await expect(canvas.getByRole("button", { name: /suggest prompts/i })).toBeDisabled();
		await expect(canvas.queryByText(/unsaved changes/i)).not.toBeInTheDocument();
	},
};

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

export const SuggestMoreAddsToTheList: Story = {
	args: Default.args,
	render: (args) => {
		mockSuggestions();
		return <PromptsEditor {...args} />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole("button", { name: /suggest prompts/i }));
		await userEvent.click(await findRemoveButton(canvas, SUGGESTIONS[2]!.prompt));

		await userEvent.click(canvas.getByRole("button", { name: /suggest more/i }));
		await findRemoveButton(canvas, MORE_SUGGESTIONS[0]!.prompt);

		await expect(removeButtons(canvas, SUGGESTIONS[2]!.prompt)).toHaveLength(0);
		await expect(canvas.getByText("6 added")).toBeVisible();
	},
};

export const DismissAllSuggestions: Story = {
	args: Default.args,
	render: (args) => {
		mockSuggestions();
		return <PromptsEditor {...args} />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole("button", { name: /suggest prompts/i }));
		await findRemoveButton(canvas, SUGGESTIONS[0]!.prompt);

		await userEvent.click(canvas.getByRole("button", { name: /dismiss all/i }));

		await expect(removeButtons(canvas, SUGGESTIONS[0]!.prompt)).toHaveLength(0);
		await expect(canvas.queryByText(/unsaved changes/i)).not.toBeInTheDocument();
	},
};
