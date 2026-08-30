/**
 * Stories for <AppSidebar /> across deployment environments.
 *
 * One story per real deployment scenario:
 *  - Local (self-hosted, no auth)
 *  - Demo (read-only preview)
 *  - Whitelabel, plus admin, report-only and pre-onboarding variants
 *  - Cloud, the only mode whose settings nav carries Billing
 *  - Admin routes, where the admin links move from the account menu to the rail
 *
 * Every story passes `brand`, because the Settings group is gated on
 * `brand.onboarded` and the sidebar takes it as a prop from the route loader
 * rather than reading the useBrand hook.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { DEFAULT_CHART_COLORS } from "@workspace/config/constants";
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar";
import { expect, screen, userEvent, within } from "storybook/test";
import { AppSidebar } from "@/components/app-sidebar";
import { type ClientConfig, setMockClientConfig } from "./_mocks/config-client";
import { setMockOrganizations } from "./_mocks/server-organizations";
import { setMockRouteContext } from "./_mocks/tanstack-router";
import { setMockAuth } from "./_mocks/use-auth";
import { setMockBrand } from "./_mocks/use-brands";

// ---------------------------------------------------------------------------
// Shared mock data
// ---------------------------------------------------------------------------

const onboardedBrand = {
	id: "brand-1",
	name: "Acme Corp",
	website: "https://acme.com",
	enabled: true,
	onboarded: true,
	createdAt: new Date().toISOString(),
	updatedAt: new Date().toISOString(),
};

const organization = {
	id: "org-1",
	slug: "mock-organization",
	name: "Acme",
	brandCreation: { kind: "allowed" as const },
	brands: [{ id: "brand-1", slug: null, name: "Acme Corp", website: "https://acme.com", onboarded: true }],
};

const newBrand = {
	id: "brand-2",
	name: "NewStartup",
	website: "https://newstartup.io",
	enabled: true,
	onboarded: false,
	createdAt: new Date().toISOString(),
	updatedAt: new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// Configs per deployment mode
// ---------------------------------------------------------------------------

const localConfig: ClientConfig = {
	mode: "local",
	features: {
		readOnly: false,
		showOptimizeButton: false,
		canCreateBrands: true,
	},
	branding: { name: "Elmo", chartColors: DEFAULT_CHART_COLORS },
	analytics: {},
};

const demoConfig: ClientConfig = {
	mode: "demo",
	features: {
		readOnly: true,
		showOptimizeButton: false,
		canCreateBrands: false,
	},
	branding: { name: "Elmo", chartColors: DEFAULT_CHART_COLORS },
	analytics: {},
};

const whitelabelConfig: ClientConfig = {
	mode: "whitelabel",
	features: {
		readOnly: false,
		showOptimizeButton: true,
		canCreateBrands: false,
	},
	branding: {
		name: "BrandMonitor Pro",
		icon: "https://api.dicebear.com/9.x/shapes/svg?seed=brand",
		parentName: "AgencyCo",
		parentUrl: "https://agency.example.com",
		optimizationUrlTemplate: "https://agency.example.com/optimize?prompt={{promptId}}",
		chartColors: DEFAULT_CHART_COLORS,
	},
	analytics: {},
};

const whitelabelAdminConfig: ClientConfig = {
	...whitelabelConfig,
};

/**
 * Cloud is the only mode with billing, so it is the only one whose settings
 * nav carries a Billing item. Report generation is off there, so the admin
 * Reports section stays hidden even for an admin.
 */
const cloudConfig: ClientConfig = {
	mode: "cloud",
	features: {
		readOnly: false,
		showOptimizeButton: false,
		canCreateBrands: true,
		billing: true,
		teamInvites: true,
		reportGeneration: false,
	},
	branding: { name: "Elmo", chartColors: DEFAULT_CHART_COLORS },
	analytics: {},
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function configureMocks(
	config: ClientConfig,
	brand: any,
	auth?: Parameters<typeof setMockAuth>[0],
	viewer: { isAdmin: boolean; hasReportAccess: boolean } = { isAdmin: false, hasReportAccess: false },
	organizations: Parameters<typeof setMockOrganizations>[0] = [organization],
) {
	setMockClientConfig(config);
	setMockBrand(brand);
	setMockOrganizations(organizations);
	setMockRouteContext({ clientConfig: config, ...viewer });
	if (auth) setMockAuth(auth);
	return brand;
}

const authedUser = (name: string, email: string, seed: string) => ({
	user: {
		name,
		email,
		picture: `https://api.dicebear.com/9.x/avataaars/svg?seed=${seed}`,
		given_name: name.split(" ")[0],
		family_name: name.split(" ")[1] ?? "",
	},
	isLoading: false,
	isAuthenticated: true,
	loginUrl: "/auth/login",
	logoutUrl: "/auth/logout",
});

/**
 * Wrapper that contains the sidebar within a bounded box.
 *
 * The shadcn Sidebar uses `position: fixed` and `h-svh` / `min-h-svh` which
 * would otherwise break out of the story frame and overlap Ladle's own UI.
 *
 * Two constraints keep it bounded:
 *  1. `transform: translate(0)` on the outer div creates a new CSS containing
 *     block so that `position: fixed` children are positioned relative to this
 *     container instead of the viewport.
 *  2. Scoped style overrides swap `h-svh` / `min-h-svh` for `h-full` /
 *     `min-h-full` so the sidebar fits the container's height.
 */
function SidebarFrame({ children, label }: { children: React.ReactNode; label: string }) {
	return (
		<div
			className="sidebar-story-container relative h-[600px] w-full max-w-[1200px] border rounded-lg overflow-hidden bg-background"
			style={{ transform: "translate(0)" }}
		>
			<style>{`
				.sidebar-story-container [data-slot="sidebar-wrapper"] {
					min-height: 100% !important;
					height: 100% !important;
				}
				.sidebar-story-container [data-slot="sidebar-container"] {
					position: absolute !important;
					height: 100% !important;
				}
			`}</style>
			<SidebarProvider>
				{children}
				<SidebarInset>
					<div className="flex items-center justify-center h-full text-muted-foreground text-sm">{label}</div>
				</SidebarInset>
			</SidebarProvider>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

export default {
	title: "App Sidebar",
} satisfies Meta;

/** Local (self-hosted) — all nav visible, admin access, self-registered user */
export const Local: StoryObj = {
	render: () => {
		const brand = configureMocks(
			localConfig,
			onboardedBrand,
			authedUser("Local Admin", "admin@localhost", "local-admin"),
			{ isAdmin: true, hasReportAccess: true },
		);

		return (
			<SidebarFrame label="Local — Self-hosted, full admin">
				<AppSidebar scope="brand" brand={brand} organization={organization} />
			</SidebarFrame>
		);
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.queryByText("Workflows")).toBeNull();

		await userEvent.click(await canvas.findByRole("button", { name: "Account and organizations" }));
		await expect(await screen.findByText("Workflows")).toBeInTheDocument();
		await expect(await screen.findByText("Tools")).toBeInTheDocument();
	},
};

/** Demo — read-only preview, seeded user, no admin */
export const Demo = () => {
	const demoUser = authedUser("Demo User", "demo@elmohq.com", "demo");
	demoUser.user.picture = "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=Adrian";
	const brand = configureMocks(demoConfig, onboardedBrand, demoUser);

	return (
		<SidebarFrame label="Demo — Read-only, seeded user">
			<AppSidebar scope="brand" brand={brand} organization={organization} />
		</SidebarFrame>
	);
};

/** Whitelabel — regular authenticated user, full dashboard + settings */
export const Whitelabel = () => {
	const brand = configureMocks(
		whitelabelConfig,
		onboardedBrand,
		authedUser("Alice Partner", "alice@agency.com", "alice"),
	);

	return (
		<SidebarFrame label="Whitelabel — Regular user, no admin section">
			<AppSidebar scope="brand" brand={brand} organization={organization} />
		</SidebarFrame>
	);
};

/** Whitelabel (Admin) — Brands, Reports, Workflows and Tools under the account menu */
export const WhitelabelAdmin = () => {
	const brand = configureMocks(
		whitelabelAdminConfig,
		onboardedBrand,
		authedUser("Jane Admin", "jane@agency.com", "jane"),
		{ isAdmin: true, hasReportAccess: true },
	);

	return (
		<SidebarFrame label="Whitelabel Admin — Admin links live in the account menu">
			<AppSidebar scope="brand" brand={brand} organization={organization} />
		</SidebarFrame>
	);
};

/** Whitelabel (Report-only) — limited admin access, only reports visible */
export const WhitelabelReportOnly: StoryObj = {
	render: () => {
		const brand = configureMocks(
			whitelabelAdminConfig,
			onboardedBrand,
			authedUser("Report Viewer", "reports@client.com", "reports"),
			{ isAdmin: false, hasReportAccess: true },
		);

		return (
			<SidebarFrame label="Whitelabel Report-only — Reports is the only admin entry">
				<AppSidebar scope="brand" brand={brand} organization={organization} />
			</SidebarFrame>
		);
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(await canvas.findByRole("button", { name: "Account and organizations" }));

		await expect(await screen.findByText("Reports")).toBeInTheDocument();
		await expect(screen.queryByText("Workflows")).toBeNull();
	},
};

/** Admin route — the rail switches over to admin nav, and the account menu drops it */
export const AdminRoute: StoryObj = {
	render: () => {
		configureMocks(whitelabelAdminConfig, onboardedBrand, authedUser("Jane Admin", "jane@agency.com", "jane"), {
			isAdmin: true,
			hasReportAccess: true,
		});

		return (
			<SidebarFrame label="Admin route — admin nav on the rail">
				<AppSidebar scope="admin" />
			</SidebarFrame>
		);
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText("Workflows")).toBeInTheDocument();
		await expect(await canvas.findByText("Tools")).toBeInTheDocument();

		await userEvent.click(await canvas.findByRole("button", { name: "Account and organizations" }));
		const menu = within(await screen.findByRole("menu"));
		await expect(menu.queryByText("Tools")).toBeNull();
	},
};

export const Cloud: StoryObj = {
	render: () => {
		configureMocks(cloudConfig, onboardedBrand, authedUser("Dana Cloud", "dana@acme.com", "dana"), {
			isAdmin: true,
			hasReportAccess: true,
		});

		return (
			<SidebarFrame label="Cloud — Billing and Team on the organization's rail">
				<AppSidebar scope="organization" organization={organization} />
			</SidebarFrame>
		);
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		// Billing is cloud-only, and it is the last settings item, so it can sit
		// below the fold of this frame — assert it rather than eyeballing it.
		await expect(await canvas.findByText("Billing")).toBeInTheDocument();
		await expect(await canvas.findByText("Team")).toBeInTheDocument();

		await userEvent.click(await canvas.findByRole("button", { name: "Account and organizations" }));
		await expect(await screen.findByText("Workflows")).toBeInTheDocument();
		await expect(screen.queryByText("Reports")).toBeNull();
	},
};

export const WhitelabelHasNoBillingOrTeam: StoryObj = {
	render: () => {
		configureMocks(whitelabelConfig, onboardedBrand, authedUser("Alice", "alice@agency.com", "alice2"));

		return (
			<SidebarFrame label="Whitelabel — no Billing or Team item">
				<AppSidebar scope="organization" organization={organization} />
			</SidebarFrame>
		);
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText("Brands")).toBeInTheDocument();
		await expect(canvas.queryByText("Team")).toBeNull();
		await expect(canvas.queryByText("Billing")).toBeNull();
	},
};

export const ChoosePlanGate: StoryObj = {
	render: () => {
		configureMocks(cloudConfig, onboardedBrand, authedUser("Gated User", "gated@acme.com", "gated"), {
			isAdmin: true,
			hasReportAccess: true,
		});

		return (
			<SidebarFrame label="Cloud gate — nothing to navigate to yet">
				<AppSidebar scope="account" />
			</SidebarFrame>
		);
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.queryByRole("button", { name: "Account and organizations" })).toBeNull();

		await userEvent.click(await canvas.findByRole("button", { name: "Account" }));
		await expect(await screen.findByText("Log out")).toBeInTheDocument();
	},
};

/** Many organizations — the account menu collapses to a single switcher link */
export const ManyOrganizations: StoryObj = {
	render: () => {
		const brand = configureMocks(
			cloudConfig,
			onboardedBrand,
			authedUser("Multi Org", "multi@acme.com", "multi"),
			undefined,
			Array.from({ length: 5 }, (_, index) => ({
				id: `org-${index + 1}`,
				slug: `org-${index + 1}`,
				name: `Organization ${index + 1}`,
				brandCreation: { kind: "allowed" as const },
				brands: [],
			})),
		);

		return (
			<SidebarFrame label="Many organizations — account menu links to the switcher">
				<AppSidebar scope="brand" brand={brand} organization={organization} />
			</SidebarFrame>
		);
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(await canvas.findByRole("button", { name: "Account and organizations" }));

		await expect(await screen.findByText("Switch Brand")).toBeInTheDocument();
		await expect(screen.queryByText("Organization 1")).toBeNull();
	},
};

/** Whitelabel (Onboarding) — brand not yet onboarded, reduced nav */
export const WhitelabelOnboarding = () => {
	const brand = configureMocks(whitelabelConfig, newBrand, authedUser("New User", "new@agency.com", "newuser"));

	return (
		<SidebarFrame label="Whitelabel Onboarding — Brand not onboarded, minimal nav">
			<AppSidebar scope="brand" brand={brand} organization={organization} />
		</SidebarFrame>
	);
};
