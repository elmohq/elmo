/**
 * Stories for the two pages of the password-reset flow: asking for the link,
 * and choosing the new password once it's been followed.
 *
 * Demo and whitelabel never reach either — demo shares one account and
 * whitelabel has no password to reset. Only cloud can send the mail today, so
 * the self-hosted story shows the styling rather than a reachable page.
 */
import type { Meta } from "@storybook/react";
import type { ReactNode } from "react";
import { ForgotPasswordForm } from "@/routes/auth/forgot-password";
import { ResetPasswordForm } from "@/routes/auth/reset-password";
import { resetMockAuthClient } from "./_mocks/auth-client";

function Shell({ children }: { children: ReactNode }) {
	return <div className="bg-background text-foreground antialiased min-h-svh">{children}</div>;
}

export default {
	title: "Auth / Reset password",
	parameters: { layout: "fullscreen" },
	decorators: [
		(Story) => {
			resetMockAuthClient();
			return <Shell>{<Story />}</Shell>;
		},
	],
} satisfies Meta;

/** Cloud, asking where to send the link. */
export const Cloud = () => <ForgotPasswordForm isCloud />;

/** The neutral confirmation, which says the same thing whether or not the account exists. */
export const CloudLinkSent = () => <ForgotPasswordForm isCloud submitted />;

/** How the page would read on a self-hosted instance, once one can send mail. */
export const SelfHosted = () => <ForgotPasswordForm />;

/** After following the link: the form the new password goes into. */
export const ChooseNewPassword = () => <ResetPasswordForm isCloud token="a-valid-looking-token" />;

/** A link that was already used, or has aged out. */
export const LinkExpired = () => <ResetPasswordForm isCloud linkError="INVALID_TOKEN" />;
