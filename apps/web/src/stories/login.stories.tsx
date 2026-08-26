/**
 * Stories for the sign-in page, one per deployment mode.
 *
 * The mode components are rendered directly rather than through the file route,
 * because Route.useSearch() isn't modeled by the router mock. Everything the
 * sales panel shows — engine coverage, sampling rate, entry price — comes from
 * packages/config, so these stories are also where a plan change shows up first.
 */
import type { Meta } from "@storybook/react";
import type { ReactNode } from "react";
import { DemoLogin, EmailPasswordLogin } from "@/routes/auth/login";

function Shell({ children }: { children: ReactNode }) {
	return <div className="bg-background text-foreground antialiased min-h-svh">{children}</div>;
}

export default {
	title: "Auth / Sign in",
	parameters: { layout: "fullscreen" },
	decorators: [(Story) => <Shell>{<Story />}</Shell>],
} satisfies Meta;

/** Cloud — Google, password recovery, and the pitch for signing up with us. */
export const Cloud = () => <EmailPasswordLogin isCloud canRegister />;

/** Self-hosted, before the bootstrap signup: the register link is still offered. */
export const SelfHostedUnbootstrapped = () => <EmailPasswordLogin canRegister />;

/** Self-hosted, after the single account exists. The panel pitches Cloud as the alternative. */
export const SelfHostedBootstrapped = () => <EmailPasswordLogin />;

/** Demo — the shared credentials on a plain card, with nothing to sell. */
export const Demo = () => <DemoLogin />;
