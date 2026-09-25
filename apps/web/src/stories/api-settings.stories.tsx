import type { Meta, StoryObj } from "@storybook/react";
import type { ComponentType, ReactNode } from "react";
import { expect, within } from "storybook/test";
import { Route } from "@/routes/_authed/app/org/$org/settings/api";
import { setMockRouteContext } from "./_mocks/tanstack-router";

const ApiSettingsPage = (Route as unknown as { options: { component: ComponentType } }).options.component;

function load(appName = "Elmo", appUrl = "https://app.elmohq.com/", readOnly = false) {
	setMockRouteContext({ clientConfig: { branding: { name: appName, url: appUrl }, features: { readOnly } } });
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
	},
};

export const Whitelabel: Story = {
	render: () => {
		load("Acme Visibility", "https://visibility.acme.com/");
		return <ApiSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText("Reference for the Acme Visibility REST API.")).toBeVisible();
		// Nothing on the page names the vendor.
		await expect(canvas.queryByText(/elmo/i)).toBeNull();
	},
};

export const ReadOnlyDeployment: Story = {
	render: () => {
		load("Elmo", "https://app.elmohq.com/", true);
		return <ApiSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText("API access is disabled in demo mode.")).toBeVisible();
	},
};
