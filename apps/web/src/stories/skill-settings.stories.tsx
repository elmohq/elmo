import type { Meta, StoryObj } from "@storybook/react";
import type { ComponentType, ReactNode } from "react";
import { expect, within } from "storybook/test";
import { Route } from "@/routes/_authed/app/org/$org/settings/skill";
import { setMockLoaderData, setMockRouteContext } from "./_mocks/tanstack-router";

const SkillPage = (Route as unknown as { options: { component: ComponentType } }).options.component;

function Shell({ children }: { children: ReactNode }) {
	return <div className="bg-background text-foreground antialiased min-h-svh p-4 md:p-6">{children}</div>;
}

const meta = {
	title: "Settings/Skill",
	component: SkillPage,
	parameters: { layout: "fullscreen" },
	decorators: [
		(Story) => (
			<Shell>
				<Story />
			</Shell>
		),
	],
} satisfies Meta<typeof SkillPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Install: Story = {
	render: () => {
		setMockRouteContext({ clientConfig: { mode: "cloud", features: { readOnly: false } } });
		setMockLoaderData({ organization: { id: "org-1", name: "Acme", slug: "acme" } });
		return <SkillPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText("npx skills add elmohq/elmo")).toBeVisible();
		await expect(canvas.getByRole("link", { name: "skills/aeo" })).toHaveAttribute(
			"href",
			"https://github.com/elmohq/elmo/tree/main/skills/aeo",
		);
	},
};
