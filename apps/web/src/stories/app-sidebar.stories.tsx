/**
 * Stories for <AppSidebar /> across deployment environments.
 *
 * One story per real deployment scenario:
 *  - Local (self-hosted, no auth)
 *  - Demo (read-only preview)
 *  - Whitelabel, plus admin, report-only and pre-onboarding variants
 *  - Cloud, the only mode whose settings nav carries Billing
 *
 * Every story passes `brand`, because the Settings group is gated on
 * `brand.onboarded` and the sidebar takes it as a prop from the route loader
 * rather than reading the useBrand hook.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { DEFAULT_CHART_COLORS } from "@workspace/config/constants";
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar";
import { expect, within } from "storybook/test";
import { AppSidebar } from "@/components/app-sidebar";
import { type ClientConfig, setMockClientConfig } from "./_mocks/config-client";
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

/**
 * The organization the `/app/org/$org` layout would have resolved. The rail names it
 * and lists its brands from here, so every story hands one over.
 */
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

/**
 * Returns the brand so stories can pass it to AppSidebar: the Settings nav is
 * gated on `brand.onboarded`, and it comes from the route loader as a prop
 * rather than from the useBrand hook.
 */
function configureMocks(config: ClientConfig, brand: any, auth?: Parameters<typeof setMockAuth>[0]) {
	setMockClientConfig(config);
	setMockBrand(brand);
	setMockRouteContext({ clientConfig: config });
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
export const Local = () => {
	const brand = configureMocks(
		localConfig,
		onboardedBrand,
		authedUser("Local Admin", "admin@localhost", "local-admin"),
	);

	return (
		<SidebarFrame label="Local — Self-hosted, full admin">
			<AppSidebar scope="brand" isAdmin={true} hasReportAccess={true} brand={brand} organization={organization} />
		</SidebarFrame>
	);
};

/** Demo — read-only preview, seeded user, no admin */
export const Demo = () => {
	const demoUser = authedUser("Demo User", "demo@elmohq.com", "demo");
	demoUser.user.picture = "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=Adrian";
	const brand = configureMocks(demoConfig, onboardedBrand, demoUser);

	return (
		<SidebarFrame label="Demo — Read-only, seeded user">
			<AppSidebar scope="brand" isAdmin={false} hasReportAccess={false} brand={brand} organization={organization} />
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
			<AppSidebar scope="brand" isAdmin={false} hasReportAccess={false} brand={brand} organization={organization} />
		</SidebarFrame>
	);
};

/** Whitelabel (Admin) — admin section with Brands, Reports, Workflows, Tools */
export const WhitelabelAdmin = () => {
	const brand = configureMocks(
		whitelabelAdminConfig,
		onboardedBrand,
		authedUser("Jane Admin", "jane@agency.com", "jane"),
	);

	return (
		<SidebarFrame label="Whitelabel Admin — Full admin section visible">
			<AppSidebar scope="brand" isAdmin={true} hasReportAccess={true} brand={brand} organization={organization} />
		</SidebarFrame>
	);
};

/** Whitelabel (Report-only) — limited admin access, only reports visible */
export const WhitelabelReportOnly = () => {
	const brand = configureMocks(
		whitelabelAdminConfig,
		onboardedBrand,
		authedUser("Report Viewer", "reports@client.com", "reports"),
	);

	return (
		<SidebarFrame label="Whitelabel Report-only — Dashboard + Reports admin section">
			<AppSidebar scope="brand" isAdmin={false} hasReportAccess={true} brand={brand} organization={organization} />
		</SidebarFrame>
	);
};

/** Cloud — an organization's rail gains Billing; no report generation */
export const Cloud: StoryObj = {
	render: () => {
		configureMocks(cloudConfig, onboardedBrand, authedUser("Dana Cloud", "dana@acme.com", "dana"));

		return (
			<SidebarFrame label="Cloud — Billing and Team on the organization's rail">
				<AppSidebar scope="organization" isAdmin={false} hasReportAccess={false} organization={organization} />
			</SidebarFrame>
		);
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		// Billing is cloud-only, and it is the last settings item, so it can sit
		// below the fold of this frame — assert it rather than eyeballing it.
		await expect(await canvas.findByText("Billing")).toBeInTheDocument();
		await expect(await canvas.findByText("Team")).toBeInTheDocument();
		// Reports are disabled in cloud even for a user with report access.
		await expect(canvas.queryByText("Reports")).toBeNull();
	},
};

/** Whitelabel has no billing, so the organization's rail stops at Team. */
export const WhitelabelHasNoBilling: StoryObj = {
	render: () => {
		configureMocks(whitelabelConfig, onboardedBrand, authedUser("Alice", "alice@agency.com", "alice2"));

		return (
			<SidebarFrame label="Whitelabel — no Billing item">
				<AppSidebar scope="organization" isAdmin={false} hasReportAccess={false} organization={organization} />
			</SidebarFrame>
		);
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText("Team")).toBeInTheDocument();
		await expect(canvas.queryByText("Billing")).toBeNull();
	},
};

/** Whitelabel (Onboarding) — brand not yet onboarded, reduced nav */
export const WhitelabelOnboarding = () => {
	const brand = configureMocks(whitelabelConfig, newBrand, authedUser("New User", "new@agency.com", "newuser"));

	return (
		<SidebarFrame label="Whitelabel Onboarding — Brand not onboarded, minimal nav">
			<AppSidebar scope="brand" isAdmin={false} hasReportAccess={false} brand={brand} organization={organization} />
		</SidebarFrame>
	);
};
