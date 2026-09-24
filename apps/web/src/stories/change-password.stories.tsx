import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "storybook/test";
import { ChangePasswordForm, Route } from "@/routes/_authed/change-password";
import { getMockSubscriptionCalls, resetMockAuthClient, setMockSubscriptionError } from "./_mocks/auth-client";
import { setMockRouteContext } from "./_mocks/tanstack-router";

const meta = {
	title: "Auth / Change password",
	component: ChangePasswordForm,
	parameters: { layout: "fullscreen" },
	beforeEach: () => {
		resetMockAuthClient();
		setMockRouteContext({ clientConfig: { mode: "local" } });
	},
} satisfies Meta<typeof ChangePasswordForm>;

export default meta;
type Story = StoryObj<typeof meta>;

async function fillPasswords(canvasElement: HTMLElement, confirmation = "new-password-123") {
	const canvas = within(canvasElement);
	await userEvent.type(canvas.getByLabelText("Current password"), "old-password-123");
	await userEvent.type(canvas.getByLabelText("New password"), "new-password-123");
	await userEvent.type(canvas.getByLabelText("Confirm new password"), confirmation);
	await userEvent.click(canvas.getByRole("button", { name: "Change password" }));
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
		await expect(await canvas.findByText("Password updated")).toBeVisible();
		await expect(canvas.getByText("Continue")).toBeVisible();
		await expect(canvas.queryByLabelText("Current password")).not.toBeInTheDocument();
		await expect(getMockSubscriptionCalls()).toEqual([
			{ method: "changePassword", args: { currentPassword: "old-password-123", newPassword: "new-password-123" } },
		]);
	},
};

export const InvalidCurrentPassword: Story = {
	play: async ({ canvasElement }) => {
		setMockSubscriptionError("Invalid password");
		const canvas = await fillPasswords(canvasElement);
		await expect(await canvas.findByRole("alert")).toHaveTextContent("Invalid password");
		await expect(canvas.getByRole("button", { name: "Change password" })).toBeEnabled();
		await expect(canvas.queryByText("Password updated")).not.toBeInTheDocument();
		setMockSubscriptionError(null);
		await userEvent.click(canvas.getByRole("button", { name: "Change password" }));
		await expect(await canvas.findByText("Password updated")).toBeVisible();
	},
};

export const Demo: Story = {
	render: () => {
		setMockRouteContext({ clientConfig: { mode: "demo" } });
		const Page = Route.options.component as typeof ChangePasswordForm;
		return <Page />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getByText("Password changes are disabled for the shared demo account.")).toBeVisible();
		await expect(canvas.queryByLabelText("Current password")).not.toBeInTheDocument();
	},
};

export const SingleSignOn: Story = {
	render: () => {
		setMockRouteContext({ clientConfig: { mode: "whitelabel" } });
		const Page = Route.options.component as typeof ChangePasswordForm;
		return <Page />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getByText(/Your password is managed by your sign-in provider/)).toBeVisible();
		await expect(canvas.queryByLabelText("Current password")).not.toBeInTheDocument();
	},
};
