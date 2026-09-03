import type { Meta, StoryObj } from "@storybook/react";
import type { ComponentType, ReactNode } from "react";
import { expect, userEvent, within } from "storybook/test";
import { API_SCOPES } from "@/lib/api/scopes";
import { Route } from "@/routes/_authed/app/org/$org/settings/api-keys";
import { type ApiKeysPageData, setMockApiKeys } from "./_mocks/server-api-keys";
import { setMockLoaderData } from "./_mocks/tanstack-router";

const ApiKeysSettingsPage = (Route as unknown as { options: { component: ComponentType } }).options.component;

const BRANDS = [
	{ id: "brand-1", name: "Acme Corp" },
	{ id: "brand-2", name: "Acme Labs" },
	{ id: "brand-3", name: "Acme Studio" },
];

const KEYS: ApiKeysPageData["keys"] = [
	{
		id: "key-1",
		name: "Reporting pipeline",
		start: "elmo_9f2c",
		scopes: ["brands:read", "prompts:read", "prompts:write", "analytics:read"],
		brandIds: null,
		enabled: true,
		createdAt: "2026-06-14T10:00:00.000Z",
		lastUsedAt: "2026-08-31T08:12:00.000Z",
		expiresAt: null,
	},
	{
		id: "key-2",
		name: "Claude Code (MCP)",
		start: "elmo_41ba",
		scopes: ["brands:read", "prompts:read", "analytics:read", "runs:read"],
		brandIds: ["brand-1"],
		enabled: true,
		createdAt: "2026-07-02T10:00:00.000Z",
		lastUsedAt: null,
		expiresAt: "2026-12-28T10:00:00.000Z",
	},
	{
		id: "key-3",
		name: "Old dashboard export",
		start: "elmo_7dd0",
		scopes: ["analytics:read"],
		brandIds: ["brand-2", "brand-3"],
		enabled: true,
		createdAt: "2025-09-01T10:00:00.000Z",
		lastUsedAt: "2026-01-19T10:00:00.000Z",
		expiresAt: "2026-03-01T10:00:00.000Z",
	},
];

function load(page: Partial<ApiKeysPageData>) {
	const data: ApiKeysPageData = {
		organization: { id: "org-1", name: "Acme", role: "admin" },
		canManage: true,
		keys: [],
		brands: BRANDS,
		allScopes: API_SCOPES,
		expiryOptions: [30, 90, 180, 365],
		...page,
	};
	setMockApiKeys(data);
	setMockLoaderData(data);
}

function Shell({ children }: { children: ReactNode }) {
	return <div className="bg-background text-foreground antialiased min-h-svh p-4 md:p-6">{children}</div>;
}

const meta = {
	title: "Settings/API Keys",
	component: ApiKeysSettingsPage,
	parameters: { layout: "fullscreen" },
	decorators: [
		(Story) => (
			<Shell>
				<Story />
			</Shell>
		),
	],
} satisfies Meta<typeof ApiKeysSettingsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithKeys: Story = {
	render: () => {
		load({ keys: KEYS, canManage: true });
		return <ApiKeysSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByRole("heading", { name: "API Keys" })).toBeVisible();
		await expect(await canvas.findByText("Expired")).toBeVisible();
		await expect((await canvas.findAllByText("Active")).length).toBe(2);
		await expect(await canvas.findByRole("button", { name: "New key" })).toBeVisible();
		await expect(canvas.queryByLabelText("Name")).toBeNull();
	},
};

export const NoKeys: Story = {
	render: () => {
		load({ keys: [], canManage: true });
		return <ApiKeysSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText("No API keys yet")).toBeVisible();
		await userEvent.click(await canvas.findByRole("button", { name: "Create your first key" }));
		await expect(await within(document.body).findByRole("dialog")).toBeVisible();
	},
};

export const NonAdmin: Story = {
	render: () => {
		load({ keys: KEYS, canManage: false });
		return <ApiKeysSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.queryByRole("button", { name: "New key" })).toBeNull();
		await expect(canvas.queryByRole("button", { name: "Revoke" })).toBeNull();
		await expect(await canvas.findByText("Reporting pipeline")).toBeVisible();
	},
};

export const CreateKeyDialog: Story = {
	render: () => {
		load({ keys: KEYS, canManage: true });
		return <ApiKeysSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		await userEvent.click(await within(canvasElement).findByRole("button", { name: "New key" }));
		const dialog = within(await within(document.body).findByRole("dialog"));
		await expect(await dialog.findByLabelText("Name")).toBeVisible();
		await expect(await dialog.findByText("6/10")).toBeVisible();
	},
};

export const ScopePresets: Story = {
	render: () => {
		load({ keys: KEYS, canManage: true });
		return <ApiKeysSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		await userEvent.click(await within(canvasElement).findByRole("button", { name: "New key" }));
		const dialog = within(await within(document.body).findByRole("dialog"));
		await userEvent.click(await dialog.findByRole("button", { name: "Full access" }));
		await expect(await dialog.findByText("10/10")).toBeVisible();
		const competitors = within(await dialog.findByRole("group", { name: "Competitors" }));
		await expect(await competitors.findByRole("checkbox", { name: "Delete" })).toBeChecked();
	},
};

export const RestrictedToBrands: Story = {
	render: () => {
		load({ keys: KEYS, canManage: true });
		return <ApiKeysSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		await userEvent.click(await within(canvasElement).findByRole("button", { name: "New key" }));
		const dialog = within(await within(document.body).findByRole("dialog"));
		await expect(dialog.queryByRole("checkbox", { name: "Acme Labs" })).toBeNull();
		await userEvent.click(await dialog.findByRole("checkbox", { name: /restrict this key to specific brands/i }));
		await expect(await dialog.findByRole("checkbox", { name: "Acme Labs" })).toBeVisible();
	},
};

export const KeyJustCreated: Story = {
	render: () => {
		load({ keys: KEYS, canManage: true });
		return <ApiKeysSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(await canvas.findByRole("button", { name: "New key" }));
		const dialog = within(await within(document.body).findByRole("dialog"));
		await userEvent.type(await dialog.findByLabelText("Name"), "Nightly export");
		await userEvent.click(await dialog.findByRole("button", { name: "Create key" }));
		await expect(await canvas.findByText("Key created")).toBeVisible();
		await expect(await canvas.findByText("elmo_5f3b9c1d84a24e7fbc2a6d0e91f7c3b8")).toBeVisible();
	},
};

export const RevokeConfirmation: Story = {
	render: () => {
		load({ keys: KEYS, canManage: true });
		return <ApiKeysSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const rows = await canvas.findAllByRole("button", { name: "Revoke" });
		await userEvent.click(rows[0]);
		const dialog = within(document.body);
		await expect(await dialog.findByText("Revoke Reporting pipeline?")).toBeVisible();
		await expect(await dialog.findByRole("button", { name: "Revoke key" })).toBeVisible();
	},
};
