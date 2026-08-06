/**
 * /auth/register - Account registration page
 *
 * Available in local mode for the single bootstrap signup and in cloud mode
 * for public self-serve signup. Cloud requires email verification before
 * sign-in and also offers Google OAuth.
 */

import { IconBrandGoogle } from "@tabler/icons-react";
import { createFileRoute, Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import type { ClientConfig } from "@workspace/config/types";
import { authClient } from "@workspace/lib/auth/client";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Separator } from "@workspace/ui/components/separator";
import { useState } from "react";
import { z } from "zod";
import FullPageCard from "@/components/full-page-card";
import { safeReturnTo } from "@/lib/return-to";

export const Route = createFileRoute("/auth/register")({
	validateSearch: z.object({
		returnTo: z.string().optional(),
	}),
	component: RegisterPage,
});

function RegisterPage() {
	const { returnTo } = Route.useSearch();
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const canRegister = context.clientConfig?.canRegister ?? false;
	const hasUsers = context.clientConfig?.hasUsers ?? false;
	const isCloud = context.clientConfig?.mode === "cloud";
	const navigate = useNavigate();
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [pendingVerification, setPendingVerification] = useState(false);
	const [resending, setResending] = useState(false);

	if (!canRegister) {
		window.location.href = "/auth/login";
		return null;
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setLoading(true);

		try {
			const result = await authClient.signUp.email({
				email,
				password,
				name,
				...(isCloud && { callbackURL: safeReturnTo(returnTo) }),
			});

			if (result.error) {
				setError(result.error.message ?? "Registration failed");
				setLoading(false);
				return;
			}

			if (isCloud) {
				setPendingVerification(true);
				setLoading(false);
				return;
			}

			navigate({ to: returnTo ?? "/app" });
		} catch {
			setError("Something went wrong. Please try again.");
			setLoading(false);
		}
	}

	async function handleResend() {
		setResending(true);
		try {
			await authClient.sendVerificationEmail({ email, callbackURL: safeReturnTo(returnTo) });
		} finally {
			setResending(false);
		}
	}

	if (pendingVerification) {
		return (
			<FullPageCard title="Check your email" subtitle={`We sent a verification link to ${email}`}>
				<div className="space-y-4 w-full">
					<p className="text-sm text-muted-foreground text-center">
						Click the link in the email to verify your address and get started. The link expires, so verify soon.
					</p>
					<Button type="button" variant="outline" className="w-full" onClick={handleResend} disabled={resending}>
						{resending ? "Sending..." : "Resend verification email"}
					</Button>
				</div>
			</FullPageCard>
		);
	}

	return (
		<FullPageCard title="Create account" subtitle="Sign up to get started">
			{isCloud && (
				<div className="space-y-4 w-full pb-4">
					<Button
						type="button"
						variant="outline"
						className="w-full"
						onClick={() => authClient.signIn.social({ provider: "google", callbackURL: safeReturnTo(returnTo) })}
					>
						<IconBrandGoogle className="size-4" />
						Continue with Google
					</Button>
					<div className="flex items-center gap-3">
						<Separator className="flex-1" />
						<span className="text-xs text-muted-foreground">or</span>
						<Separator className="flex-1" />
					</div>
				</div>
			)}
			<form onSubmit={handleSubmit} className="space-y-4 w-full">
				{error && (
					<Alert variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}
				<div className="space-y-2">
					<Label htmlFor="name">Name</Label>
					<Input
						id="name"
						type="text"
						placeholder="Your name"
						value={name}
						onChange={(e) => setName(e.target.value)}
						required
						autoComplete="name"
						autoFocus
					/>
				</div>
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
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="password">Password</Label>
					<Input
						id="password"
						type="password"
						placeholder="Create a password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						required
						autoComplete="new-password"
						minLength={isCloud ? 8 : 6}
					/>
				</div>
				<Button type="submit" className="w-full" disabled={loading}>
					{loading ? "Creating account..." : "Create account"}
				</Button>
			</form>
			{hasUsers && (
				<p className="text-center text-sm text-muted-foreground pt-4">
					Already have an account?{" "}
					<Link
						to="/auth/login"
						search={returnTo ? { returnTo } : {}}
						className="text-primary hover:underline font-medium"
					>
						Sign in
					</Link>
				</p>
			)}
		</FullPageCard>
	);
}
