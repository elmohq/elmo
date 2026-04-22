/**
 * /auth/login - Login page
 *
 * Local/cloud modes: email/password form.
 * Whitelabel mode: auto-redirects to Auth0 SSO (no form shown).
 */
import { useState, useEffect } from "react";
import { createFileRoute, useNavigate, Link, useRouteContext } from "@tanstack/react-router";
import { z } from "zod";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import FullPageCard from "@/components/full-page-card";
import { authClient } from "@workspace/lib/auth/client";
import type { ClientConfig } from "@workspace/config/types";

export const Route = createFileRoute("/auth/login")({
	validateSearch: z.object({
		returnTo: z.string().optional(),
	}),
	component: LoginPage,
});

/** Reject cross-origin returnTo values to prevent open redirects. */
function safeReturnTo(returnTo: string | undefined): string {
	if (!returnTo) return "/app";
	if (returnTo.startsWith("/") && !returnTo.startsWith("//")) return returnTo;
	try {
		const url = new URL(returnTo, window.location.origin);
		if (url.origin !== window.location.origin) return "/app";
		return `${url.pathname}${url.search}${url.hash}`;
	} catch {
		return "/app";
	}
}

function LoginPage() {
	const { returnTo } = Route.useSearch();
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const mode = context.clientConfig?.mode;

	if (mode === "whitelabel") {
		return <SSOLogin returnTo={returnTo} />;
	}

	return <EmailPasswordLogin returnTo={returnTo} isDemo={mode === "demo"} />;
}

function SSOLogin({ returnTo }: { returnTo?: string }) {
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;

		authClient.signIn
			.sso({ providerId: "auth0-whitelabel", callbackURL: safeReturnTo(returnTo) })
			.then((result) => {
				if (cancelled) return;
				if (result.error) {
					setError(result.error.message ?? "Failed to start sign-in");
				}
			})
			.catch(() => {
				if (!cancelled) {
					setError("Something went wrong. Please try again.");
				}
			});

		return () => {
			cancelled = true;
		};
	}, [returnTo]);

	if (error) {
		return (
			<FullPageCard title="Sign in">
				<Alert variant="destructive">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
				<Button className="w-full" onClick={() => window.location.reload()}>
					Try Again
				</Button>
			</FullPageCard>
		);
	}

	return (
		<FullPageCard title="Signing in..." subtitle="Redirecting to your identity provider" />
	);
}

function EmailPasswordLogin({ returnTo, isDemo }: { returnTo?: string; isDemo?: boolean }) {
	const navigate = useNavigate();
	const [email, setEmail] = useState(isDemo ? "demo@elmohq.com" : "");
	const [password, setPassword] = useState(isDemo ? "demo" : "");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setLoading(true);

		try {
			const result = await authClient.signIn.email({
				email,
				password,
			});

			if (result.error) {
				setError(result.error.message ?? "Invalid email or password");
				setLoading(false);
				return;
			}

			navigate({ to: safeReturnTo(returnTo) });
		} catch {
			setError("Something went wrong. Please try again.");
			setLoading(false);
		}
	}

	return (
		<FullPageCard title="Sign in" subtitle="Enter your email and password to continue">
			<form onSubmit={handleSubmit} className="space-y-4 w-full">
				{isDemo && (
					<Alert>
						<AlertDescription>
							Demo mode — sign in with <strong>demo@elmohq.com</strong> / <strong>demo</strong>.
						</AlertDescription>
					</Alert>
				)}
				{error && (
					<Alert variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}
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
				<div className="space-y-2">
					<Label htmlFor="password">Password</Label>
					<Input
						id="password"
						type="password"
						placeholder="Password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						required
						autoComplete="current-password"
					/>
				</div>
				<Button type="submit" className="w-full" disabled={loading}>
					{loading ? "Signing in..." : "Sign in"}
				</Button>
			</form>
			<p className="text-center text-sm text-muted-foreground">
				Don't have an account?{" "}
				<Link
					to="/auth/register"
					search={returnTo ? { returnTo } : {}}
					className="text-primary hover:underline font-medium"
				>
					Create one
				</Link>
			</p>
		</FullPageCard>
	);
}
