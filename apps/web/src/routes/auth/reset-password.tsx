/**
 * /auth/reset-password - Choose a new password from a reset link (cloud only)
 *
 * Better-auth redirects here with ?token=... on a valid link, or
 * ?error=INVALID_TOKEN on a bad one.
 */

import { createFileRoute, Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import type { ClientConfig } from "@workspace/config/types";
import { authClient } from "@workspace/lib/auth/client";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { useState } from "react";
import { z } from "zod";
import { AuthSplitLayout } from "@/components/auth/auth-split-layout";
import { SalesFooterLinks, SalesPanel } from "@/components/auth/sales-panel";
import { buildTitle, getAppName } from "@/lib/route-head";

export const Route = createFileRoute("/auth/reset-password")({
	validateSearch: z.object({
		token: z.string().optional(),
		error: z.string().optional(),
	}),
	head: ({ match }) => {
		const appName = getAppName(match);
		return {
			meta: [
				{ title: buildTitle("Choose a new password", { appName }) },
				{ name: "description", content: "Set a new password for your account." },
			],
		};
	},
	component: ResetPasswordPage,
});

function ResetPasswordPage() {
	const { token, error } = Route.useSearch();
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };

	// Cloud is the only mode that can have issued the link that leads here.
	if (context.clientConfig?.mode !== "cloud") {
		window.location.href = "/auth/login";
		return null;
	}

	return <ResetPasswordForm token={token} linkError={error} isCloud />;
}

export function ResetPasswordForm({
	token,
	linkError,
	isCloud,
}: {
	token?: string;
	/** Set by better-auth when the link is bad, in place of a token. */
	linkError?: string;
	isCloud?: boolean;
}) {
	const navigate = useNavigate();
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const source = isCloud ? "cloud-signin" : "self-hosted-signin";

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		if (newPassword !== confirmPassword) {
			setError("Passwords do not match");
			return;
		}
		setLoading(true);

		try {
			const result = await authClient.resetPassword({ newPassword, token: token as string });
			if (result.error) {
				setError(result.error.message ?? "Failed to reset password");
				setLoading(false);
				return;
			}
			navigate({ to: "/auth/login" });
		} catch {
			setError("Something went wrong. Please try again.");
			setLoading(false);
		}
	}

	const panel = <SalesPanel variant={isCloud ? "cloud" : "self-hosted"} source={source} />;
	const footer = <SalesFooterLinks source={source} />;

	if (linkError || !token) {
		return (
			<AuthSplitLayout
				title="Reset link invalid or expired"
				subtitle="Reset links are single-use and time-limited."
				pitch={panel}
				footer={footer}
			>
				{/* The only thing to do from here, so it carries the weight the other
				    pages give their submit button. */}
				<Link to="/auth/forgot-password" className={buttonVariants({ className: "w-full" })}>
					Request a new reset link
				</Link>
			</AuthSplitLayout>
		);
	}

	return (
		<AuthSplitLayout title="Choose a new password" pitch={panel} footer={footer}>
			<form onSubmit={handleSubmit} className="space-y-4 w-full">
				{error && (
					<Alert variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}
				<div className="space-y-2">
					<Label htmlFor="new-password">New password</Label>
					<Input
						id="new-password"
						type="password"
						placeholder="New password"
						value={newPassword}
						onChange={(e) => setNewPassword(e.target.value)}
						required
						autoComplete="new-password"
						minLength={8}
						autoFocus
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="confirm-password">Confirm password</Label>
					<Input
						id="confirm-password"
						type="password"
						placeholder="Confirm password"
						value={confirmPassword}
						onChange={(e) => setConfirmPassword(e.target.value)}
						required
						autoComplete="new-password"
						minLength={8}
					/>
				</div>
				<Button type="submit" className="w-full" disabled={loading}>
					{loading ? "Resetting..." : "Reset password"}
				</Button>
			</form>
		</AuthSplitLayout>
	);
}
