/**
 * Behaviour the shared components are expected to keep, pinned because the
 * underlying primitive library defaults the other way and a wrapper edit would
 * otherwise flip it silently.
 */
import type { Meta, StoryObj } from "@storybook/react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";

const meta = {
	title: "Components/UI Primitives",
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

/** Arrow keys move between tabs and switch the panel as they go. */
export const TabsSwitchOnArrowKeys: Story = {
	render: () => (
		<div className="p-8">
			<Tabs defaultValue="mentions">
				<TabsList>
					<TabsTrigger value="mentions">Mentions</TabsTrigger>
					<TabsTrigger value="citations">Citations</TabsTrigger>
				</TabsList>
				<TabsContent value="mentions">who mentioned the brand</TabsContent>
				<TabsContent value="citations">what linked to it</TabsContent>
			</Tabs>
		</div>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText("who mentioned the brand")).toBeVisible();

		await userEvent.click(canvas.getByRole("tab", { name: "Mentions" }));
		await userEvent.keyboard("{ArrowRight}");

		// No Enter: moving focus is what selects.
		await waitFor(async () => {
			await expect(canvas.getByText("what linked to it")).toBeVisible();
		});
	},
};

/** Picking a radio option closes the menu rather than leaving it open. */
export const RadioMenuClosesOnPick: Story = {
	render: function RadioMenu() {
		const [model, setModel] = useState("all");
		return (
			<div className="p-8">
				<DropdownMenu>
					<DropdownMenuTrigger>Model: {model}</DropdownMenuTrigger>
					<DropdownMenuContent>
						<DropdownMenuRadioGroup value={model} onValueChange={(next) => setModel(String(next))}>
							<DropdownMenuRadioItem value="all">All models</DropdownMenuRadioItem>
							<DropdownMenuRadioItem value="chatgpt">ChatGPT</DropdownMenuRadioItem>
						</DropdownMenuRadioGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		);
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		// The menu portals out of the canvas, so query the whole document.
		const screen = within(document.body);

		await userEvent.click(await canvas.findByRole("button", { name: /model: all/i }));
		await userEvent.click(await screen.findByRole("menuitemradio", { name: "ChatGPT" }));

		await expect(await canvas.findByRole("button", { name: /model: chatgpt/i })).toBeVisible();
		await waitFor(async () => {
			await expect(screen.queryByRole("menuitemradio", { name: "ChatGPT" })).toBeNull();
		});
	},
};
