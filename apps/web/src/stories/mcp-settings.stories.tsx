import type { Meta, StoryObj } from "@storybook/react";
import type { ComponentType, ReactNode } from "react";
import { expect, userEvent, within } from "storybook/test";
import { Route } from "@/routes/_authed/app/org/$org/settings/mcp";
import { type McpPageData, setMockMcpPage } from "./_mocks/server-mcp";
import { setMockLoaderData, setMockRouteContext } from "./_mocks/tanstack-router";

const McpSettingsPage = (Route as unknown as { options: { component: ComponentType } }).options.component;

function load(page: Partial<McpPageData>, appName = "Elmo", appUrl = "https://app.elmohq.com/") {
	setMockMcpPage(page);
	setMockRouteContext({ clientConfig: { branding: { name: appName, url: appUrl } } });
	setMockLoaderData({
		tools: [],
		readOnlyDeployment: false,
		...page,
	});
}

function Shell({ children }: { children: ReactNode }) {
	return <div className="bg-background text-foreground antialiased min-h-svh p-4 md:p-6">{children}</div>;
}

const TOOLS: McpPageData["tools"] = [
	{ name: "whoami", title: "Describe the calling key", scopes: [], readOnly: true },
	{ name: "list_brands", title: "List the brands this key can reach", scopes: ["brands:read"], readOnly: true },
	{ name: "list_prompts", title: "List the prompts on a brand", scopes: ["prompts:read"], readOnly: true },
	{ name: "create_prompts", title: "Add prompts to a brand", scopes: ["prompts:write"], readOnly: false },
	{ name: "get_analytics", title: "Read visibility and share of voice", scopes: ["analytics:read"], readOnly: true },
];

const meta = {
	title: "Settings/MCP",
	component: McpSettingsPage,
	parameters: { layout: "fullscreen" },
	decorators: [
		(Story) => (
			<Shell>
				<Story />
			</Shell>
		),
	],
} satisfies Meta<typeof McpSettingsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Connect: Story = {
	render: () => {
		load({ tools: TOOLS });
		return <McpSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		// The endpoint is this deployment's, not a placeholder to fill in.
		await expect(await canvas.findByText("https://app.elmohq.com/api/mcp")).toBeVisible();
		await expect(await canvas.findByText("create_prompts")).toBeVisible();
		await expect(await canvas.findByText("prompts:write")).toBeVisible();
	},
};

export const OtherClients: Story = {
	render: () => {
		load({ tools: TOOLS });
		return <McpSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(await canvas.findByRole("tab", { name: "OpenCode" }));
		await expect(await canvas.findByText(/opencode.ai\/config.json/)).toBeVisible();
	},
};

export const Whitelabel: Story = {
	render: () => {
		load({ tools: TOOLS }, "Acme Visibility", "https://visibility.acme.com/");
		return <McpSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText("https://visibility.acme.com/api/mcp")).toBeVisible();
		// Nothing on the page sends a whitelabel customer to the vendor.
		await expect(canvas.queryByText(/elmohq\.com/)).toBeNull();
	},
};

export const ReadOnlyDeployment: Story = {
	render: () => {
		load({ tools: TOOLS, readOnlyDeployment: true });
		return <McpSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText(/read-only, so the tools that write are withheld/)).toBeVisible();
	},
};
