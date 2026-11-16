import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router";
import type { ClientConfig } from "@workspace/config/types";
import { authClient } from "@workspace/lib/auth/client";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { useState } from "react";
import FullPageCard from "@/components/full-page-card";
import { buildTitle, getAppName } from "@/lib/route-head";

export const Route = createFileRoute("/_authed/change-password")({
	head: ({ match }) => {
		const appName = getAppName(match);
		return {
			meta: [
				{ title: buildTitle("Change Password", { appName }) },
				{ name: "description", content: "Change the password for your account." },
			],
		};
	},
	component: ChangePasswordPage,
});

function ChangePasswordPage() {
	const { clientConfig } = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };

	if (clientConfig?.mode === "demo" || clientConfig?.mode === "whitelabel") {
		return (
			<FullPageCard
				title="Change Password"
				subtitle={
					clientConfig.mode === "demo"
						? "Password changes are disabled for the demo."
						: "Change your password with your provider."
				}
				showBackButton
			/>
		);
	}

	return <PasswordAccountGate />;
}

function PasswordAccountGate() {
	const accounts = useQuery({
		queryKey: ["auth", "accounts"],
		queryFn: async () => {
			const result = await authClient.listAccounts();
			if (result.error) throw new Error(result.error.message);
			return result.data;
		},
	});

	if (accounts.isPending) return null;

	if (accounts.data && !accounts.data.some((account) => account.providerId === "credential")) {
		return (
			<FullPageCard title="Change Password" subtitle="You don't have a password yet." showBackButton>
				<Link to="/auth/forgot-password" className={buttonVariants({ className: "w-full" })}>
					Set a Password
				</Link>
			</FullPageCard>
		);
	}

	return <ChangePasswordForm />;
}

function ChangePasswordForm() {
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [updated, setUpdated] = useState(false);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		if (newPassword !== confirmPassword) {
			setError("Passwords do not match");
			return;
		}
		setLoading(true);

		try {
			const result = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
			if (result.error) {
				setError(result.error.message ?? "Failed to change password");
				setLoading(false);
				return;
			}
			setUpdated(true);
		} catch {
			setError("Something went wrong. Please try again.");
			setLoading(false);
		}
	}

	if (updated) {
		return (
			<FullPageCard title="Password Updated" subtitle="Your password has been changed.">
				<Link to="/app" className={buttonVariants({ className: "w-full" })}>
					Continue
				</Link>
			</FullPageCard>
		);
	}

	return (
		<FullPageCard title="Change Password" subtitle="Enter your current password and choose a new one.">
			<form onSubmit={handleSubmit} className="space-y-4 w-full">
				{error && (
					<Alert variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}
				<div className="space-y-2">
					<Label htmlFor="current-password">Current Password</Label>
					<Input
						id="current-password"
						type="password"
						placeholder="Current password"
						value={currentPassword}
						onChange={(e) => setCurrentPassword(e.target.value)}
						required
						autoComplete="current-password"
						autoFocus
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="new-password">New Password</Label>
					<Input
						id="new-password"
						type="password"
						placeholder="New password"
						value={newPassword}
						onChange={(e) => setNewPassword(e.target.value)}
						required
						autoComplete="new-password"
						minLength={8}
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="confirm-password">Confirm New Password</Label>
					<Input
						id="confirm-password"
						type="password"
						placeholder="Confirm new password"
						value={confirmPassword}
						onChange={(e) => setConfirmPassword(e.target.value)}
						required
						autoComplete="new-password"
						minLength={8}
					/>
				</div>
				<Button type="submit" className="w-full" disabled={loading}>
					{loading ? "Changing..." : "Change Password"}
				</Button>
			</form>
		</FullPageCard>
	);
}
