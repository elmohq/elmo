/**
 * Stories for the sign-in page, one per deployment mode.
 *
 * The mode components are rendered directly rather than through the file route,
 * because Route.useSearch() isn't modeled by the router mock. Everything the
 * sales panel shows — engine coverage, the runs-per-day comparison — comes from
 * packages/config, so these stories are also where a plan change shows up first.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { DEFAULT_CHART_COLORS } from "@workspace/config/constants";
import type { ReactNode } from "react";
import { expect, within } from "storybook/test";
import { DemoLogin, EmailPasswordLogin, SSOLogin } from "@/routes/auth/login";
import { resetMockAuthClient, setMockEmailSignIn, setMockLastLoginMethod, setMockSsoError } from "./_mocks/auth-client";
import { type ClientConfig, setMockClientConfig } from "./_mocks/config-client";
import { setMockRouteContext } from "./_mocks/tanstack-router";

const elmoConfig: ClientConfig = {
	mode: "local",
	features: { readOnly: false, showOptimizeButton: false, canCreateBrands: true },
	branding: { name: "Elmo", chartColors: DEFAULT_CHART_COLORS.map((c) => c) },
	analytics: {},
	defaultDelayHours: 24,
	canRegister: true,
	hasUsers: true,
};

/** The same tenant the sidebar, brand kit and export stories use. */
const whitelabelConfig: ClientConfig = {
	mode: "whitelabel",
	features: { readOnly: false, showOptimizeButton: true, canCreateBrands: false },
	branding: {
		name: "BrandMonitor Pro",
		icon: "https://api.dicebear.com/9.x/shapes/svg?seed=brand",
		parentName: "AgencyCo",
		parentUrl: "https://agency.example.com",
		chartColors: DEFAULT_CHART_COLORS.map((c) => c),
	},
	analytics: {},
	defaultDelayHours: 24,
	canRegister: false,
	hasUsers: true,
};

function Shell({ children }: { children: ReactNode }) {
	return <div className="bg-background text-foreground antialiased min-h-svh">{children}</div>;
}

/** Whitelabel renders the tenant's own name and mark, never ours. */
function applyWhitelabelBranding() {
	setMockClientConfig(whitelabelConfig);
	setMockRouteContext({ clientConfig: whitelabelConfig });
}

export default {
	title: "Auth / Sign in",
	parameters: { layout: "fullscreen" },
	decorators: [
		(Story) => {
			resetMockAuthClient();
			setMockClientConfig(elmoConfig);
			setMockRouteContext({ clientConfig: elmoConfig });
			return <Shell>{<Story />}</Shell>;
		},
	],
} satisfies Meta;

/** Cloud — Google, password recovery, and the pitch for signing up with us. */
export const Cloud: StoryObj = {
	render: () => <EmailPasswordLogin isCloud canRegister />,
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.queryByText("Last Used")).not.toBeInTheDocument();
		await expect(canvas.getByRole("button", { name: "Continue with Google" })).toBeVisible();
		await expect(canvas.getByRole("button", { name: "Sign In" })).toBeVisible();
	},
};

export const CloudLastUsedGoogle: StoryObj = {
	render: () => {
		setMockLastLoginMethod("google");
		return <EmailPasswordLogin isCloud canRegister />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByRole("button", { name: "Continue with Google Last Used" })).toBeVisible();
		await expect(canvas.getByRole("button", { name: "Sign In" })).toBeVisible();
		await expect(canvas.getAllByText("Last Used")).toHaveLength(1);
	},
};

export const CloudLastUsedEmail: StoryObj = {
	render: () => {
		setMockLastLoginMethod("email");
		return <EmailPasswordLogin isCloud canRegister />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByRole("button", { name: "Sign In Last Used" })).toBeVisible();
		await expect(canvas.getByRole("button", { name: "Continue with Google" })).toBeVisible();
		await expect(canvas.getAllByText("Last Used")).toHaveLength(1);
	},
};

export const CloudUnknownLoginMethod: StoryObj = {
	render: () => {
		setMockLastLoginMethod("unknown");
		return <EmailPasswordLogin isCloud canRegister />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.queryByText("Last Used")).not.toBeInTheDocument();
	},
};

/**
 * Self-hosted, once the instance has its account. Before that the page
 * redirects to sign-up, so there is no unbootstrapped story to tell.
 */
export const SelfHosted: StoryObj = {
	render: () => {
		setMockLastLoginMethod("email");
		return <EmailPasswordLogin />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.queryByText("Last Used")).not.toBeInTheDocument();
		await expect(canvas.queryByRole("button", { name: /Google/ })).not.toBeInTheDocument();
	},
};

/** Demo signs in to the shared account on its own; this is what shows meanwhile. */
export const Demo = () => {
	setMockEmailSignIn("hang");
	return <DemoLogin />;
};

/** Demo when the automatic sign-in fails: the error, and a way to retry. */
export const DemoError = () => {
	setMockEmailSignIn({ error: "Invalid email or password" });
	return <DemoLogin />;
};

/**
 * Whitelabel sign-in: no form, no pitch, just the tenant's mark while the
 * browser is handed to their identity provider. The redirect starts on mount,
 * so this is the whole of what a tenant's user ever sees.
 */
export const Whitelabel = () => {
	applyWhitelabelBranding();
	return <SSOLogin />;
};

/** Whitelabel when the handoff fails: the one button that can recover it. */
export const WhitelabelError = () => {
	applyWhitelabelBranding();
	setMockSsoError("Failed to start sign-in");
	return <SSOLogin />;
};
