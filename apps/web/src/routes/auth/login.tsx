/**
 * /auth/login - Login page
 *
 * Local/cloud modes: email/password form beside the sales panel.
 * Demo mode: signs in to the shared account automatically — a demo visitor
 * is already looking, and has nothing to buy.
 * Whitelabel mode: auto-redirects to Auth0 SSO (no form shown).
 */

import { IconBrandGoogle } from "@tabler/icons-react";
import { createFileRoute, Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import { MCP_AUTHORIZE_ENDPOINT } from "@workspace/config/constants";
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
import { LegalConsentNotice } from "@/components/legal-consent-notice";
import { type AttributionParams, attributionParams } from "@/lib/attribution";
import { safeReturnTo } from "@/lib/return-to";
import { buildTitle, getAppName } from "@/lib/route-head";

/**
 * When the OAuth plugin sent the browser here mid-flow, handing the signed query
 * back to the authorization endpoint resumes it — including for the paths that
 * leave for an identity provider, where the request is gone on return.
 */
function postSignInDestination(search: LoginSearch): string {
	if (!search.sig) return safeReturnTo(search.returnTo);
	const query = new URLSearchParams(
		Object.entries(search).flatMap(([key, value]) =>
			value === undefined ? [] : [[key, String(value)] as [string, string]],
		),
	);
	return `${MCP_AUTHORIZE_ENDPOINT}?${query}`;
}

/** A passthrough: the plugin signs the whole query, so a dropped parameter is a
 * signature that no longer verifies. */
interface LoginSearch extends AttributionParams {
	returnTo?: string;
	sig?: string;
}

export const Route = createFileRoute("/auth/login")({
	validateSearch: (search: Record<string, unknown>): LoginSearch => search,
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
	const search = Route.useSearch();
	const { returnTo } = search;
	const destination = postSignInDestination(search);
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const mode = context.clientConfig?.mode;
	const canRegister = context.clientConfig?.canRegister ?? false;
	const hasUsers = context.clientConfig?.hasUsers ?? false;

	if (mode === "whitelabel") {
		return <SSOLogin destination={destination} />;
	}

	if (mode === "demo") {
		return <DemoLogin destination={destination} />;
	}

	if (mode === "local" && !hasUsers) {
		window.location.href = "/auth/register";
		return null;
	}

	return (
		<EmailPasswordLogin
			destination={destination}
			returnTo={returnTo}
			attribution={attributionParams(search)}
			isCloud={mode === "cloud"}
			canRegister={canRegister}
		/>
	);
}

export function SSOLogin({ destination = "/app" }: { destination?: string }) {
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;

		authClient.signIn
			.sso({ providerId: "auth0-whitelabel", callbackURL: destination })
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
	}, [destination]);

	if (error) return <SignInFailed error={error} />;

	return <FullPageCard title="Signing in..." subtitle="Redirecting to your identity provider" />;
}

export function DemoLogin({ destination = "/app" }: { destination?: string }) {
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;

		authClient.signIn
			.email({ email: "demo@elmohq.com", password: "demo" })
			.then((result) => {
				if (cancelled) return;
				if (result.error) {
					setError(result.error.message ?? "Invalid email or password");
					return;
				}
				window.location.href = destination;
			})
			.catch(() => {
				if (!cancelled) setError("Something went wrong. Please try again.");
			});

		return () => {
			cancelled = true;
		};
	}, [destination]);

	if (error) return <SignInFailed error={error} />;

	return <FullPageCard title="Signing in..." subtitle="Opening the demo account" />;
}

function SignInFailed({ error }: { error: string }) {
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

export function EmailPasswordLogin({
	destination = "/app",
	returnTo,
	attribution,
	isCloud,
	canRegister,
}: {
	destination?: string;
	returnTo?: string;
	attribution?: AttributionParams;
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
				// An expired authorization request; dropping it makes the next attempt
				// an ordinary sign-in.
				if ((result.error as { error?: string }).error === "invalid_signature") {
					// Through the router, so `destination` is recomputed.
					navigate({ to: "/auth/login", search: {}, replace: true });
					setError("That connection request expired. Sign in again, then start the connection from your MCP client.");
					setLoading(false);
					return;
				}
				if (isCloud && result.error.status === 403) {
					setError("Please verify your email first — we just sent you a new verification link.");
				} else {
					setError(result.error.message ?? "Invalid email or password");
				}
				setLoading(false);
				return;
			}

			window.location.href = destination;
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
						onClick={() => authClient.signIn.social({ provider: "google", callbackURL: destination })}
					>
						<IconBrandGoogle className="size-4" />
						Continue with Google
					</Button>
					<LegalConsentNotice action="continuing with Google" />
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
						search={{ ...(returnTo ? { returnTo } : {}), ...attribution }}
						className="text-primary hover:underline font-medium"
					>
						Create one
					</Link>
				</p>
			)}
		</AuthSplitLayout>
	);
}
