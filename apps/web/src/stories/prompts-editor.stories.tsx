import type { Meta, StoryObj } from "@storybook/react";
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar";
import { PromptsEditor } from "@/components/prompts-editor";

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
	args: {
		initialPrompts: prompts,
		brandId: "mock-brand-id",
		pageTitle: "Prompts",
		pageDescription: "Add, edit, or remove your brand tracking keywords and prompts",
	},
};
