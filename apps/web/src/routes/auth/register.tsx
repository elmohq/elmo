/**
 * /auth/register - Account registration page
 *
 * Available in local mode for the single bootstrap signup and in cloud mode
 * for public self-serve signup. Cloud requires email verification before
 * sign-in and also offers Google OAuth.
 */

import { translate, useI18n } from "@/lib/i18n";
import { IconBrandGoogle } from "@tabler/icons-react";
import { createFileRoute, Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import { CLOUD_ENTRY_PRICE_USD } from "@workspace/config/plans";
import type { ClientConfig } from "@workspace/config/types";
import { authClient } from "@workspace/lib/auth/client";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Separator } from "@workspace/ui/components/separator";
import { useState } from "react";
import { z } from "zod";
import { AuthSplitLayout } from "@/components/auth/auth-split-layout";
import { SalesFooterLinks, SalesPanel } from "@/components/auth/sales-panel";
import FullPageCard from "@/components/full-page-card";
import { safeReturnTo } from "@/lib/return-to";
import { buildTitle, getAppName } from "@/lib/route-head";

export const Route = createFileRoute("/auth/register")({
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
			meta: [{ title: buildTitle(translate(match.context?.locale ?? "en", "Sign up"), { appName }) },
				{ name: "description", content: translate(match.context?.locale ?? "en", "Create an account.") },],
		};
	},
	component: RegisterPage,
});

function RegisterPage() {
	const { returnTo, ref: incomingRef } = Route.useSearch();
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const canRegister = context.clientConfig?.canRegister ?? false;

	if (!canRegister) {
		window.location.href = "/auth/login";
		return null;
	}

	return (
		<RegisterForm
			returnTo={returnTo}
			incomingRef={incomingRef}
			isCloud={context.clientConfig?.mode === "cloud"}
			hasUsers={context.clientConfig?.hasUsers ?? false}
		/>
	);
}

export function RegisterForm({
	returnTo,
	incomingRef,
	isCloud,
	hasUsers,
}: {
	returnTo?: string;
	/** The `ref` this page was reached with, kept on links that stay inside auth. */
	incomingRef?: string;
	isCloud?: boolean;
	/** A local instance before its bootstrap signup has nowhere to send an existing account. */
	hasUsers?: boolean;
}) {
	const { t } = useI18n();
	const navigate = useNavigate();
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [pendingVerification, setPendingVerification] = useState(false);
	const [resending, setResending] = useState(false);
	const source = isCloud ? "cloud-signup" : "self-hosted-signup";

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
				setError(t(result.error.message ?? "Registration failed"));
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
			setError(t("Something went wrong. Please try again."));
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
			<FullPageCard title={t("Check your email")} subtitle={t("We sent a verification link to {email}", { email })}>
				<div className="space-y-4 w-full">
					<p className="text-sm text-muted-foreground text-center">
						{t("Click the link in the email to verify your address and get started. The link expires, so verify soon.")}
					</p>
					<Button type="button" variant="outline" className="w-full" onClick={handleResend} disabled={resending}>
						{resending ? t("Sending...") : t("Resend verification email")}
					</Button>
				</div>
			</FullPageCard>
		);
	}

	return (
		<AuthSplitLayout
			title={isCloud ? t("Start tracking your AI visibility") : t("Create your admin account")}
			subtitle={
				isCloud
					? t("Plans start at ${price}/mo. Cancel any time.", { price: CLOUD_ENTRY_PRICE_USD })
					: t("This is the owner account for your self-hosted instance.")
			}
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
						{t("Continue with Google")}
					</Button>
					<div className="flex items-center gap-3">
						<Separator className="flex-1" />
						<span className="text-xs text-muted-foreground">{t("or")}</span>
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
					<Label htmlFor="name">{t("Name")}</Label>
					<Input
						id="name"
						type="text"
						placeholder={t("Your name")}
						value={name}
						onChange={(e) => setName(e.target.value)}
						required
						autoComplete="name"
						autoFocus
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="email">{t("Email")}</Label>
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
					<Label htmlFor="password">{t("Password")}</Label>
					<Input
						id="password"
						type="password"
						placeholder={t("Create a password")}
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						required
						autoComplete="new-password"
						minLength={isCloud ? 8 : 6}
					/>
				</div>
				<Button type="submit" className="w-full" disabled={loading}>
					{loading ? t("Creating account...") : t("Create account")}
				</Button>
			</form>
			{hasUsers && (
				<p className="text-sm text-muted-foreground pt-4">
					{t("Already have an account?")}{" "}
					<Link
						to="/auth/login"
						search={{ ...(returnTo ? { returnTo } : {}), ...(incomingRef ? { ref: incomingRef } : {}) }}
						className="text-primary hover:underline font-medium"
					>
						{t("Sign in")}
					</Link>
				</p>
			)}
		</AuthSplitLayout>
	);
}
