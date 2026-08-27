/**
 * Stories for the sign-in page, one per deployment mode.
 *
 * The mode components are rendered directly rather than through the file route,
 * because Route.useSearch() isn't modeled by the router mock. Everything the
 * sales panel shows — engine coverage, the runs-per-day comparison — comes from
 * packages/config, so these stories are also where a plan change shows up first.
 */
import type { Meta } from "@storybook/react";
import type { ReactNode } from "react";
import { DemoLogin, EmailPasswordLogin, SSOLogin } from "@/routes/auth/login";
import { resetMockAuthClient, setMockSsoError } from "./_mocks/auth-client";

function Shell({ children }: { children: ReactNode }) {
	return <div className="bg-background text-foreground antialiased min-h-svh">{children}</div>;
}

export default {
	title: "Auth / Sign in",
	parameters: { layout: "fullscreen" },
	decorators: [
		(Story) => {
			resetMockAuthClient();
			return <Shell>{<Story />}</Shell>;
		},
	],
} satisfies Meta;

/** Cloud — Google, password recovery, and the pitch for signing up with us. */
export const Cloud = () => <EmailPasswordLogin isCloud canRegister />;

/**
 * Self-hosted, once the instance has its account. Before that the page
 * redirects to sign-up, so there is no unbootstrapped story to tell.
 */
export const SelfHosted = () => <EmailPasswordLogin />;

/** Demo — the shared credentials on a plain card, with nothing to sell. */
export const Demo = () => <DemoLogin />;

/** Whitelabel — no form and no pitch, just the handoff to the tenant's IdP. */
export const Whitelabel = () => <SSOLogin />;

/** Whitelabel when the IdP handoff fails: the one button that can recover it. */
export const WhitelabelError = () => {
	setMockSsoError("Failed to start sign-in");
	return <SSOLogin />;
};
