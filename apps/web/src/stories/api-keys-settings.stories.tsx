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

/** The route's loader never runs in Storybook, so the story supplies its result. */
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

/** The page an admin lands on with keys already issued. */
export const WithKeys: Story = {
	render: () => {
		load({ keys: KEYS, canManage: true });
		return <ApiKeysSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByRole("heading", { name: "API keys" })).toBeVisible();
		// A key past its expiry is called out rather than sitting among the live ones.
		await expect(await canvas.findByText("Expired")).toBeVisible();
		await expect((await canvas.findAllByText("Active")).length).toBe(2);
		// The default preset is read-only, so no write scope starts ticked.
		const prompts = within(await canvas.findByRole("group", { name: "Prompts" }));
		await expect(await prompts.findByRole("checkbox", { name: "Read" })).toBeChecked();
		await expect(await prompts.findByRole("checkbox", { name: "Write" })).not.toBeChecked();
	},
};

/** Nothing issued yet: the list says so instead of rendering an empty box. */
export const NoKeys: Story = {
	render: () => {
		load({ keys: [], canManage: true });
		return <ApiKeysSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText("No API keys yet")).toBeVisible();
	},
};

/** A member sees the keys but is offered no way to change them. */
export const NonAdmin: Story = {
	render: () => {
		load({ keys: KEYS, canManage: false });
		return <ApiKeysSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.queryByRole("button", { name: "Create key" })).toBeNull();
		await expect(canvas.queryByRole("button", { name: "Revoke" })).toBeNull();
		await expect(await canvas.findByText("Reporting pipeline")).toBeVisible();
	},
};

/** The presets set every scope at once, and the tally follows them. */
export const ScopePresets: Story = {
	render: () => {
		load({ keys: KEYS, canManage: true });
		return <ApiKeysSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		// One read scope per resource, and six resources have one.
		await expect(await canvas.findByText("6/10")).toBeVisible();
		await userEvent.click(await canvas.findByRole("button", { name: "Full access" }));
		await expect(await canvas.findByText("10/10")).toBeVisible();
		const competitors = within(await canvas.findByRole("group", { name: "Competitors" }));
		await expect(await competitors.findByRole("checkbox", { name: "Delete" })).toBeChecked();
	},
};

/** Brands only become pickable once the key is narrowed to some. */
export const RestrictedToBrands: Story = {
	render: () => {
		load({ keys: KEYS, canManage: true });
		return <ApiKeysSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.queryByRole("checkbox", { name: "Acme Labs" })).toBeNull();
		await userEvent.click(await canvas.findByRole("checkbox", { name: /restrict this key to specific brands/i }));
		await expect(await canvas.findByRole("checkbox", { name: "Acme Labs" })).toBeVisible();
	},
};

/** The secret exists in the browser exactly once, so creating one surfaces it. */
export const KeyJustCreated: Story = {
	render: () => {
		load({ keys: KEYS, canManage: true });
		return <ApiKeysSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.type(await canvas.findByLabelText("Name"), "Nightly export");
		await userEvent.click(await canvas.findByRole("button", { name: "Create key" }));
		await expect(await canvas.findByText("Key created")).toBeVisible();
		// The whole secret, not the truncated prefix the list shows for stored keys.
		await expect(await canvas.findByText("elmo_5f3b9c1d84a24e7fbc2a6d0e91f7c3b8")).toBeVisible();
	},
};

/** Revoking asks first, in the app rather than through a browser prompt. */
export const RevokeConfirmation: Story = {
	render: () => {
		load({ keys: KEYS, canManage: true });
		return <ApiKeysSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const rows = await canvas.findAllByRole("button", { name: "Revoke" });
		await userEvent.click(rows[0]);
		// The dialog portals out of the canvas, so it is looked up on the body.
		const dialog = within(document.body);
		await expect(await dialog.findByText("Revoke Reporting pipeline?")).toBeVisible();
		await expect(await dialog.findByRole("button", { name: "Revoke key" })).toBeVisible();
	},
};
