/**
 * /auth/forgot-password - Request a password reset email (cloud only)
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
import FullPageCard from "@/components/full-page-card";
import * as m from "@/paraglide/messages.js";

export const Route = createFileRoute("/auth/forgot-password")({
	component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const [email, setEmail] = useState("");
	const [loading, setLoading] = useState(false);
	const [submitted, setSubmitted] = useState(false);

	if (context.clientConfig?.mode !== "cloud") {
		window.location.href = "/auth/login";
		return null;
	}

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

	if (submitted) {
		return (
			<FullPageCard
					title={m.auth_check_email()}
					subtitle={m.auth_reset_sent({ email })}
			>
				<p className="text-center text-sm text-muted-foreground w-full">
					<Link to="/auth/login" className="text-primary hover:underline font-medium">
						{m.auth_back_to_sign_in()}
					</Link>
				</p>
			</FullPageCard>
		);
	}

	return (
		<FullPageCard title={m.auth_reset_title()} subtitle={m.auth_reset_description()}>
			<form onSubmit={handleSubmit} className="space-y-4 w-full">
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
						autoFocus
					/>
				</div>
				<Button type="submit" className="w-full" disabled={loading}>
					{loading ? m.auth_sending() : m.auth_send_reset_link()}
				</Button>
			</form>
			<p className="text-center text-sm text-muted-foreground pt-4">
				<Link to="/auth/login" className="text-primary hover:underline font-medium">
					{m.auth_back_to_sign_in()}
				</Link>
			</p>
		</FullPageCard>
	);
}
