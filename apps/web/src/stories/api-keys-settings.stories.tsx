import type { Meta, StoryObj } from "@storybook/react";
import type { ComponentType, ReactNode } from "react";
import { expect, userEvent, within } from "storybook/test";
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
		scopes: ["read", "write"],
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
		scopes: ["read"],
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
		scopes: ["read"],
		brandIds: ["brand-2", "brand-3"],
		enabled: false,
		createdAt: "2025-09-01T10:00:00.000Z",
		lastUsedAt: "2026-01-19T10:00:00.000Z",
		expiresAt: "2026-03-01T10:00:00.000Z",
	},
	{
		id: "key-4",
		name: "Spring campaign",
		start: "elmo_c33a",
		scopes: ["read", "write"],
		brandIds: null,
		enabled: true,
		createdAt: "2026-02-01T10:00:00.000Z",
		lastUsedAt: "2026-04-10T10:00:00.000Z",
		expiresAt: "2026-05-01T10:00:00.000Z",
	},
];

function load(page: Partial<ApiKeysPageData>) {
	const data: ApiKeysPageData = {
		organization: { id: "org-1", name: "Acme", role: "admin" },
		canManage: true,
		keys: [],
		brands: BRANDS,
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
		await expect(await canvas.findByRole("heading", { name: "Active" })).toBeVisible();
		await expect(await canvas.findByRole("heading", { name: "Inactive" })).toBeVisible();
		// The keys that no longer authenticate say why, apart from the two that do.
		await expect(await canvas.findByText("Revoked")).toBeVisible();
		await expect(await canvas.findByText("Expired May 1, 2026")).toBeVisible();
		// A key that never expires says so rather than showing a dash.
		await expect((await canvas.findAllByText("Never")).length).toBeGreaterThan(0);
		await expect((await canvas.findAllByRole("button", { name: "Revoke" })).length).toBe(2);
		// One pill per grant, so a read-write key is visibly more than a read one.
		await expect((await canvas.findAllByText("read")).length).toBe(4);
		await expect((await canvas.findAllByText("write")).length).toBe(2);
		await expect(await canvas.findByRole("button", { name: "Add Key" })).toBeVisible();
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

export const OnlyInactiveKeys: Story = {
	render: () => {
		load({ keys: [KEYS[2]], canManage: true });
		return <ApiKeysSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText("No active API keys")).toBeVisible();
		await expect(await canvas.findByText("Old dashboard export")).toBeVisible();
		await expect(canvas.queryByRole("button", { name: "Revoke" })).toBeNull();
	},
};

export const NonAdmin: Story = {
	render: () => {
		load({ keys: KEYS, canManage: false });
		return <ApiKeysSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.queryByRole("button", { name: "Add Key" })).toBeNull();
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
		await userEvent.click(await within(canvasElement).findByRole("button", { name: "Add Key" }));
		const dialog = within(await within(document.body).findByRole("dialog"));
		await expect(await dialog.findByLabelText("Name")).toBeVisible();
		await expect(await dialog.findByRole("tab", { name: "Read-only" })).toHaveAttribute("aria-selected", "true");
	},
};

export const AccessPresets: Story = {
	render: () => {
		load({ keys: KEYS, canManage: true });
		return <ApiKeysSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		await userEvent.click(await within(canvasElement).findByRole("button", { name: "Add Key" }));
		const dialog = within(await within(document.body).findByRole("dialog"));
		await userEvent.click(await dialog.findByRole("tab", { name: "Read and write" }));
		await expect(await dialog.findByRole("tab", { name: "Read and write" })).toHaveAttribute("aria-selected", "true");
		await expect(await dialog.findByText(/plus creating, editing and deleting/)).toBeVisible();
	},
};

export const RestrictedToBrands: Story = {
	render: () => {
		load({ keys: KEYS, canManage: true });
		return <ApiKeysSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		await userEvent.click(await within(canvasElement).findByRole("button", { name: "Add Key" }));
		const dialog = within(await within(document.body).findByRole("dialog"));
		await expect(dialog.queryByRole("checkbox", { name: "Acme Labs" })).toBeNull();
		await userEvent.click(await dialog.findByRole("tab", { name: "Specific brands" }));
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
		await userEvent.click(await canvas.findByRole("button", { name: "Add Key" }));
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
		await expect(await dialog.findByText(/Revoke .Reporting pipeline.\?/)).toBeVisible();
		await expect(await dialog.findByRole("button", { name: "Revoke key" })).toBeVisible();
	},
};
