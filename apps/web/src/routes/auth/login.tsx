/**
 * /auth/login - Login page
 *
 * Local/cloud modes: email/password form beside the sales panel.
 * Demo mode: the shared credentials on a plain card — a demo visitor is
 * already looking, and has nothing to buy.
 * Whitelabel mode: auto-redirects to Auth0 SSO (no form shown).
 */

import { IconBrandGoogle, IconInfoCircle } from "@tabler/icons-react";
import { createFileRoute, Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import type { ClientConfig } from "@workspace/config/types";
import { authClient } from "@workspace/lib/auth/client";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Separator } from "@workspace/ui/components/separator";
import { useEffect, useState } from "react";
import { z } from "zod";
import { AuthSplitLayout } from "@/components/auth/auth-split-layout";
import { SalesFooterLinks, SalesPanel } from "@/components/auth/sales-panel";
import FullPageCard from "@/components/full-page-card";
import { safeReturnTo } from "@/lib/return-to";
import { buildTitle, getAppName } from "@/lib/route-head";

export const Route = createFileRoute("/auth/login")({
	validateSearch: z.object({
		returnTo: z.string().optional(),
		/**
		 * Attribution tag carried by links back to us (see
		 * @workspace/config/referrals). Declared so the router keeps it in the URL
		 * long enough for analytics to record the pageview it arrived on.
		 */
		ref: z.string().optional(),
	}),
	head: ({ match }) => {
		const appName = getAppName(match);
		return {
			meta: [
				{ title: buildTitle("Sign in", { appName }) },
				{ name: "description", content: "Sign in to your account." },
			],
		};
	},
	component: LoginPage,
});

function LoginPage() {
	const { returnTo, ref: incomingRef } = Route.useSearch();
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const mode = context.clientConfig?.mode;
	const canRegister = context.clientConfig?.canRegister ?? false;
	const hasUsers = context.clientConfig?.hasUsers ?? false;

	if (mode === "whitelabel") {
		return <SSOLogin returnTo={returnTo} />;
	}

	if (mode === "demo") {
		return <DemoLogin returnTo={returnTo} />;
	}

	// A fresh self-hosted instance has no account to sign in to, so the form
	// could only ever fail. Send them to the one thing that can work.
	if (mode === "local" && !hasUsers) {
		window.location.href = "/auth/register";
		return null;
	}

	return (
		<EmailPasswordLogin
			returnTo={returnTo}
			incomingRef={incomingRef}
			isCloud={mode === "cloud"}
			canRegister={canRegister}
		/>
	);
}

export function SSOLogin({ returnTo }: { returnTo?: string }) {
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
				<div className="w-full space-y-4">
					<Alert variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
					<Button className="w-full" onClick={() => window.location.reload()}>
						Try Again
					</Button>
				</div>
			</FullPageCard>
		);
	}

	return <FullPageCard title="Signing in..." subtitle="Redirecting to your identity provider" />;
}

/** Signs in the shared demo account, whose credentials are printed on the page. */
export function DemoLogin({ returnTo }: { returnTo?: string }) {
	const navigate = useNavigate();
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setLoading(true);

		try {
			const result = await authClient.signIn.email({ email: "demo@elmohq.com", password: "demo" });
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
		<FullPageCard title="Sign in">
			<form onSubmit={handleSubmit} className="space-y-4 w-full">
				<DemoCredentialsCallout />
				{error && (
					<Alert variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}
				<Button type="submit" className="w-full" disabled={loading}>
					{loading ? "Signing in..." : "Sign in"}
				</Button>
			</form>
		</FullPageCard>
	);
}

export function EmailPasswordLogin({
	returnTo,
	incomingRef,
	isCloud,
	canRegister,
}: {
	returnTo?: string;
	/** The `ref` this page was reached with, kept on links that stay inside auth. */
	incomingRef?: string;
	isCloud?: boolean;
	canRegister?: boolean;
}) {
	const navigate = useNavigate();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const source = isCloud ? "cloud-signin" : "self-hosted-signin";

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
				if (isCloud && result.error.status === 403) {
					setError("Please verify your email first — we just sent you a new verification link.");
				} else {
					setError(result.error.message ?? "Invalid email or password");
				}
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
		<AuthSplitLayout
			title="Welcome back"
			subtitle={isCloud ? "Check in on your AI visibility." : "Sign in to your Elmo instance."}
			pitch={<SalesPanel variant={isCloud ? "cloud" : "self-hosted"} source={source} />}
			footer={<SalesFooterLinks source={source} />}
		>
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
					<div className="flex items-center justify-between">
						<Label htmlFor="password">Password</Label>
						{isCloud && (
							<Link to="/auth/forgot-password" className="text-xs text-primary hover:underline">
								Forgot password?
							</Link>
						)}
					</div>
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
			{canRegister && (
				<p className="text-sm text-muted-foreground pt-4">
					Don't have an account?{" "}
					<Link
						to="/auth/register"
						search={{ ...(returnTo ? { returnTo } : {}), ...(incomingRef ? { ref: incomingRef } : {}) }}
						className="text-primary hover:underline font-medium"
					>
						Create one
					</Link>
				</p>
			)}
		</AuthSplitLayout>
	);
}

function DemoCredentialsCallout() {
	return (
		<div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
			<IconInfoCircle className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
			<div className="space-y-2">
				<p className="font-medium text-amber-900 dark:text-amber-100">Demo Account</p>
				<dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-amber-900/90 dark:text-amber-100/80">
					<div className="flex items-center gap-1.5">
						<dt className="opacity-70">Email</dt>
						<dd className="rounded bg-amber-500/15 px-1.5 py-0.5 font-mono text-[11px]">demo@elmohq.com</dd>
					</div>
					<div className="flex items-center gap-1.5">
						<dt className="opacity-70">Password</dt>
						<dd className="rounded bg-amber-500/15 px-1.5 py-0.5 font-mono text-[11px]">demo</dd>
					</div>
				</dl>
			</div>
		</div>
	);
}
