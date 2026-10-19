import type { Meta, StoryObj } from "@storybook/react";
import type { ComponentType, ReactNode } from "react";
import { expect, within } from "storybook/test";
import { Route } from "@/routes/_authed/app/org/$org/settings/api";
import { setMockRouteContext } from "./_mocks/tanstack-router";

const ApiSettingsPage = (Route as unknown as { options: { component: ComponentType } }).options.component;

function load(mode = "cloud", appName = "Elmo", appUrl = "https://app.elmohq.com/", readOnly = false) {
	setMockRouteContext({ clientConfig: { mode, branding: { name: appName, url: appUrl }, features: { readOnly } } });
}

function Shell({ children }: { children: ReactNode }) {
	return <div className="bg-background text-foreground antialiased min-h-svh p-4 md:p-6">{children}</div>;
}

const meta = {
	title: "Settings/API",
	component: ApiSettingsPage,
	parameters: { layout: "fullscreen" },
	decorators: [
		(Story) => (
			<Shell>
				<Story />
			</Shell>
		),
	],
} satisfies Meta<typeof ApiSettingsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Reference: Story = {
	render: () => {
		load();
		return <ApiSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByRole("heading", { name: "API Docs" })).toBeVisible();
		await expect(canvas.queryByText(/disabled in demo mode/)).toBeNull();
		// Whatever host the app is being served from is the one people should call.
		await expect(await canvas.findByText(`${window.location.origin}/api/v1`)).toBeVisible();
		// The reference reads the instance's own spec rather than a hosted copy.
		await expect(await canvas.findByTestId("api-reference-mock")).toHaveTextContent("/api/v1/openapi.json");
		await expect(canvas.getByText("npm install @elmohq/sdk")).toBeVisible();
		// The SDKs can't guess the instance, so the snippet names this one.
		await expect(canvas.getByText(new RegExp(`ELMO_BASE_URL=${window.location.origin}/api/v1`))).toBeVisible();
	},
};

export const SelfHosted: Story = {
	render: () => {
		load("local");
		return <ApiSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByRole("tab", { name: "Python" })).toBeVisible();
	},
};

export const Whitelabel: Story = {
	render: () => {
		load("whitelabel", "Acme Visibility", "https://visibility.acme.com/");
		return <ApiSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText("Programmatic interface for Acme Visibility.")).toBeVisible();
		// Nothing on the page names the vendor, so the Elmo-branded SDKs stay hidden.
		await expect(canvas.queryByText(/elmo/i)).toBeNull();
	},
};

export const ReadOnlyDeployment: Story = {
	render: () => {
		load("demo", "Elmo", "https://app.elmohq.com/", true);
		return <ApiSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText("API access is disabled in demo mode.")).toBeVisible();
		await expect(canvas.getByRole("heading", { name: "SDKs" })).toBeVisible();
	},
};
