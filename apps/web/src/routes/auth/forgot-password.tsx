/**
 * /auth/forgot-password - Request a password reset email
 *
 * Cloud only: it is the only mode that wires a sendResetPassword mailer, so
 * anywhere else the confirmation below would promise an email that never
 * arrives. Demo and whitelabel have no password to reset either way.
 *
 * Always renders the same neutral confirmation whether or not the account
 * exists, to avoid account enumeration.
 */

import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router";
import type { ClientConfig } from "@workspace/config/types";
import { authClient } from "@workspace/lib/auth/client";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { useState } from "react";
import { AuthSplitLayout } from "@/components/auth/auth-split-layout";
import { SalesFooterLinks, SalesPanel } from "@/components/auth/sales-panel";
import { buildTitle, getAppName } from "@/lib/route-head";

export const Route = createFileRoute("/auth/forgot-password")({
	head: ({ match }) => {
		const appName = getAppName(match);
		return {
			meta: [
				{ title: buildTitle("Reset password", { appName }) },
				{ name: "description", content: "Request a password reset link." },
			],
		};
	},
	component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };

	if (context.clientConfig?.mode !== "cloud") {
		window.location.href = "/auth/login";
		return null;
	}

	return <ForgotPasswordForm isCloud />;
}

export function ForgotPasswordForm({ isCloud, submitted: initiallySubmitted = false }: ForgotPasswordFormProps) {
	const [email, setEmail] = useState("");
	const [loading, setLoading] = useState(false);
	const [submitted, setSubmitted] = useState(initiallySubmitted);
	const source = isCloud ? "cloud-signin" : "self-hosted-signin";

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setLoading(true);
		try {
			await authClient.requestPasswordReset({ email, redirectTo: "/auth/reset-password" });
		} catch {
			// Same neutral confirmation on failure — no account enumeration.
		}
		setSubmitted(true);
		setLoading(false);
	}

	const panel = <SalesPanel variant={isCloud ? "cloud" : "self-hosted"} source={source} />;

	if (submitted) {
		return (
			<AuthSplitLayout
				title="Check your email"
				subtitle={
					email ? `If an account exists for ${email}, a reset link is on its way.` : "A reset link is on its way."
				}
				pitch={panel}
				footer={<SalesFooterLinks source={source} />}
			>
				<BackToSignIn />
			</AuthSplitLayout>
		);
	}

	return (
		<AuthSplitLayout
			title="Reset your password"
			subtitle="Enter your email and we'll send you a reset link."
			pitch={panel}
			footer={<SalesFooterLinks source={source} />}
		>
			<form onSubmit={handleSubmit} className="space-y-4 w-full">
				<div className="space-y-2">
					<Label htmlFor="email">Email</Label>
					<Input
						id="email"
						type="email"
						placeholder="you@example.com"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						required
						autoComplete="email"
						autoFocus
					/>
				</div>
				<Button type="submit" className="w-full" disabled={loading}>
					{loading ? "Sending..." : "Send reset link"}
				</Button>
			</form>
			<div className="pt-4">
				<BackToSignIn />
			</div>
		</AuthSplitLayout>
	);
}

interface ForgotPasswordFormProps {
	isCloud?: boolean;
	/** Starts on the confirmation screen. For stories; the page always starts on the form. */
	submitted?: boolean;
}

export function BackToSignIn() {
	return (
		<p className="text-sm text-muted-foreground">
			<Link to="/auth/login" className="text-primary hover:underline font-medium">
				Back to sign in
			</Link>
		</p>
	);
}
