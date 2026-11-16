import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "storybook/test";
import { Route } from "@/routes/_authed/change-password";
import {
	getMockSubscriptionCalls,
	resetMockAuthClient,
	setMockHasPassword,
	setMockSubscriptionError,
} from "./_mocks/auth-client";
import { setMockRouteContext } from "./_mocks/tanstack-router";

const ChangePasswordPage = Route.options.component as React.ComponentType;

const meta = {
	title: "Auth / Change Password",
	component: ChangePasswordPage,
	parameters: { layout: "fullscreen" },
	beforeEach: () => {
		resetMockAuthClient();
		setMockRouteContext({ clientConfig: { mode: "local" } });
	},
} satisfies Meta<typeof ChangePasswordPage>;

export default meta;
type Story = StoryObj<typeof meta>;

async function fillPasswords(canvasElement: HTMLElement, confirmation = "new-password-123") {
	const canvas = within(canvasElement);
	await userEvent.type(await canvas.findByLabelText("Current Password"), "old-password-123");
	await userEvent.type(canvas.getByLabelText("New Password"), "new-password-123");
	await userEvent.type(canvas.getByLabelText("Confirm New Password"), confirmation);
	await userEvent.click(canvas.getByRole("button", { name: "Change Password" }));
	return canvas;
}

export const Form: Story = {};

export const Mismatch: Story = {
	play: async ({ canvasElement }) => {
		const canvas = await fillPasswords(canvasElement, "different-password");
		await expect(await canvas.findByRole("alert")).toHaveTextContent("Passwords do not match");
		await expect(getMockSubscriptionCalls()).toHaveLength(0);
	},
};

export const Updated: Story = {
	play: async ({ canvasElement }) => {
		const canvas = await fillPasswords(canvasElement);
		await expect(await canvas.findByText("Password Updated")).toBeVisible();
		await expect(canvas.getByText("Continue")).toBeVisible();
		await expect(canvas.queryByLabelText("Current Password")).not.toBeInTheDocument();
		await expect(getMockSubscriptionCalls()).toEqual([
			{
				method: "changePassword",
				args: {
					currentPassword: "old-password-123",
					newPassword: "new-password-123",
					revokeOtherSessions: true,
				},
			},
		]);
	},
};

export const InvalidCurrentPassword: Story = {
	play: async ({ canvasElement }) => {
		setMockSubscriptionError("Invalid password");
		const canvas = await fillPasswords(canvasElement);
		await expect(await canvas.findByRole("alert")).toHaveTextContent("Invalid password");
		await expect(canvas.getByRole("button", { name: "Change Password" })).toBeEnabled();
		await expect(canvas.queryByText("Password Updated")).not.toBeInTheDocument();
		setMockSubscriptionError(null);
		await userEvent.click(canvas.getByRole("button", { name: "Change Password" }));
		await expect(await canvas.findByText("Password Updated")).toBeVisible();
	},
};

export const Demo: Story = {
	render: () => {
		setMockRouteContext({ clientConfig: { mode: "demo" } });
		return <ChangePasswordPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getByText("Password changes are disabled for the demo.")).toBeVisible();
		await expect(canvas.queryByLabelText("Current Password")).not.toBeInTheDocument();
	},
};

export const SingleSignOn: Story = {
	render: () => {
		setMockRouteContext({ clientConfig: { mode: "whitelabel" } });
		return <ChangePasswordPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getByText("Change your password with your provider.")).toBeVisible();
		await expect(canvas.queryByLabelText("Current Password")).not.toBeInTheDocument();
	},
};

export const GoogleOnlyAccount: Story = {
	beforeEach: () => {
		setMockHasPassword(false);
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText("You don't have a password yet.")).toBeVisible();
		await expect(canvas.getByRole("button", { name: "Set a Password" })).toBeVisible();
		await expect(canvas.queryByLabelText("Current Password")).not.toBeInTheDocument();
	},
};
