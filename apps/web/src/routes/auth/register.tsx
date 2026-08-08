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
import * as m from "@/paraglide/messages.js";

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
				setError(m.auth_registration_failed());
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
			setError(m.common_error());
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
			<FullPageCard title={m.auth_check_email()} subtitle={m.auth_verification_sent({ email })}>
				<div className="space-y-4 w-full">
					<p className="text-sm text-muted-foreground text-center">
						{m.auth_verification_instructions()}
					</p>
					<Button type="button" variant="outline" className="w-full" onClick={handleResend} disabled={resending}>
						{resending ? m.auth_sending() : m.auth_resend_verification()}
					</Button>
				</div>
			</FullPageCard>
		);
	}

	return (
		<FullPageCard title={m.auth_create_account()} subtitle={m.auth_create_description()}>
			{isCloud && (
				<div className="space-y-4 w-full pb-4">
					<Button
						type="button"
						variant="outline"
						className="w-full"
						onClick={() => authClient.signIn.social({ provider: "google", callbackURL: safeReturnTo(returnTo) })}
					>
						<IconBrandGoogle className="size-4" />
						{m.auth_continue_google()}
					</Button>
					<div className="flex items-center gap-3">
						<Separator className="flex-1" />
						<span className="text-xs text-muted-foreground">{m.auth_or()}</span>
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
					<Label htmlFor="name">{m.auth_name()}</Label>
					<Input
						id="name"
						type="text"
						placeholder={m.auth_name_placeholder()}
						value={name}
						onChange={(e) => setName(e.target.value)}
						required
						autoComplete="name"
						autoFocus
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="email">{m.auth_email()}</Label>
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
					<Label htmlFor="password">{m.auth_password()}</Label>
					<Input
						id="password"
						type="password"
						placeholder={m.auth_create_password_placeholder()}
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						required
						autoComplete="new-password"
						minLength={isCloud ? 8 : 6}
					/>
				</div>
				<Button type="submit" className="w-full" disabled={loading}>
					{loading ? m.auth_creating_account() : m.auth_create_account()}
				</Button>
			</form>
			{hasUsers && (
				<p className="text-center text-sm text-muted-foreground pt-4">
					{m.auth_already_account()} {" "}
					<Link
						to="/auth/login"
						search={returnTo ? { returnTo } : {}}
						className="text-primary hover:underline font-medium"
					>
						{m.auth_sign_in()}
					</Link>
				</p>
			)}
		</FullPageCard>
	);
}
