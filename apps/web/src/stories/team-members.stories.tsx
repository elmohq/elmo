import type { Meta, StoryObj } from "@storybook/react";
import type { ComponentType, ReactNode } from "react";
import { expect, within } from "storybook/test";
import { Route } from "@/routes/_authed/app/org/$org/settings/members";
import { setMockTeam, type TeamData } from "./_mocks/server-team";
import { setMockLoaderData, setMockRouteContext } from "./_mocks/tanstack-router";

const MembersPage = (Route as unknown as { options: { component: ComponentType } }).options.component;

const TEAM: TeamData = {
	organization: { id: "org-1", name: "Acme", role: "admin" },
	members: [
		{ id: "m1", userId: "u1", name: "Demo User", email: "demo@example.com", role: "admin" },
		{ id: "m2", userId: "u2", name: "Sam Rivers", email: "sam@example.com", role: "member" },
	],
	invitations: [{ id: "i1", email: "pending@example.com", role: "member", expiresAt: null }],
	canManage: true,
};

function Shell({ children }: { children: ReactNode }) {
	return <div className="bg-background text-foreground antialiased min-h-svh p-8">{children}</div>;
}

const meta = {
	title: "Cloud/Team Members",
	component: MembersPage,
	parameters: { layout: "fullscreen" },
	decorators: [
		(Story) => {
			setMockTeam(TEAM);
			setMockLoaderData(TEAM);
			setMockRouteContext({});
			return (
				<Shell>
					<Story />
				</Shell>
			);
		},
	],
} satisfies Meta<typeof MembersPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The invite row: email, role and the button all sit on one baseline. */
export const InviteRow: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByLabelText("Email")).toBeVisible();
		await expect(await canvas.findByText("Role")).toBeVisible();
		await expect(await canvas.findByRole("button", { name: /invite/i })).toBeVisible();
	},
};
