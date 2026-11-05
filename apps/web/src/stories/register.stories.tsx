/**
 * Stories for the sign-up page, one per deployment mode that has one.
 *
 * Demo and whitelabel never reach this page — /auth/register bounces to sign-in
 * when the deployment doesn't allow registration.
 */
import type { Meta } from "@storybook/react";
import type { ReactNode } from "react";
import { RegisterForm } from "@/routes/auth/register";

function Shell({ children }: { children: ReactNode }) {
	return <div className="bg-background text-foreground antialiased min-h-svh">{children}</div>;
}

export default {
	title: "Auth / Sign up",
	parameters: { layout: "fullscreen" },
	decorators: [(Story) => <Shell>{<Story />}</Shell>],
} satisfies Meta;

/** Cloud self-serve signup: Google, the price line, and the full pitch. */
export const Cloud = () => <RegisterForm isCloud hasUsers />;

/** Self-hosted bootstrap signup — the first and only account on a fresh instance. */
export const SelfHosted = () => <RegisterForm />;
