/**
 * Stories for the email/password login form.
 *
 * Renders <EmailPasswordLogin /> directly to bypass the file-route wrapper,
 * since Route.useSearch() isn't modeled by the router mock.
 */
import type { Meta } from "@storybook/react";
import { EmailPasswordLogin } from "@/routes/auth/login";

export default {
	title: "Auth / Login",
} satisfies Meta;

/** Demo mode — shows the pre-filled credentials callout. */
export const Demo = () => <EmailPasswordLogin isDemo />;

/** Standard (local/cloud) — no demo callout, empty fields. */
export const Standard = () => <EmailPasswordLogin />;
