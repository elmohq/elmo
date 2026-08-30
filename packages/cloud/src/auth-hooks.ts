/**
 * Cloud auth options for better-auth.
 *
 * Public self-serve signup: email/password with required verification,
 * Google OAuth, Resend transactional email, disposable-domain blocking,
 * invite-only signup allowlist, and umbrella org provisioning on signup.
 */

import type { CreateAuthOptions } from "@workspace/lib/auth/server";
import { provisionUmbrellaOrg } from "@workspace/lib/db/provisioning";
import { APIError } from "better-auth/api";
import { createStripeBillingPlugin } from "./billing/plugin";
import { isDisposableEmail } from "./disposable-domains";
import { sendEmail } from "./email";
import { invitationEmail, passwordResetEmail, verificationEmail } from "./email-templates";

// ── Signup allowlist ──────────────────────────────────────────────────

/**
 * Evaluate whether an email may register, given a signup allowlist.
 *
 * Gates cloud self-serve signup while the mode is still being hardened. Entry
 * forms:
 *   - exact address — "alice@partner.com"
 *   - domain suffix — "@elmohq.com" admits any address at that domain
 *   - "*" — opens signup to everyone (the public-launch escape hatch)
 * An empty allowlist denies everyone, so cloud fails closed until configured.
 * Matching is case-insensitive; a domain entry matches the whole domain only,
 * never a lookalike suffix ("@elmohq.com" rejects "x@evil-elmohq.com").
 */
function evaluateSignupAllowed(email: string, allowlist: readonly string[]): "allow" | "deny" {
	const entries = allowlist.map((entry) => entry.trim().toLowerCase()).filter(Boolean);
	if (entries.includes("*")) return "allow";
	if (entries.length === 0) return "deny";

	const address = email.trim().toLowerCase();
	const atIndex = address.lastIndexOf("@");
	const domain = atIndex === -1 ? "" : address.slice(atIndex);

	const allowed = entries.some((entry) => (entry.startsWith("@") ? entry === domain : entry === address));
	return allowed ? "allow" : "deny";
}

function getSignupAllowlist(): string[] {
	return (process.env.CLOUD_SIGNUP_ALLOWLIST || "")
		.split(",")
		.map((entry) => entry.trim().toLowerCase())
		.filter(Boolean);
}

// ── Auth options ──────────────────────────────────────────────────────

export function getCloudAuthOptions(): CreateAuthOptions {
	const appUrl = process.env.APP_URL!;
	return {
		requireEmailVerification: true,
		emailVerification: {
			sendOnSignUp: true,
			sendOnSignIn: true,
			autoSignInAfterVerification: true,
			sendVerificationEmail: async ({ user, url }) => {
				await sendEmail(user.email, verificationEmail({ url }));
			},
		},
		sendResetPassword: async ({ user, url }) => {
			await sendEmail(user.email, passwordResetEmail({ url }));
		},
		socialProviders: {
			google: {
				clientId: process.env.GOOGLE_CLIENT_ID!,
				clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
			},
		},
		databaseHooks: {
			user: {
				create: {
					before: async (user) => {
						// Cloud runs cost real provider money per prompt run, so
						// throwaway signups are rejected outright.
						if (isDisposableEmail(user.email)) {
							throw new APIError("BAD_REQUEST", {
								message: "Disposable email addresses are not supported. Please use your work or personal email.",
							});
						}
						// Invite-only allowlist (fails-closed when unconfigured).
						if (evaluateSignupAllowed(user.email, getSignupAllowlist()) === "deny") {
							throw new APIError("FORBIDDEN", {
								message: "Sign-ups are invite-only right now.",
							});
						}
					},
					after: async (user) => {
						await provisionUmbrellaOrg({
							userId: user.id,
							name: user.name?.trim() ? `${user.name.trim()}'s organization` : "My organization",
						});
					},
				},
			},
		},
		extraPlugins: [createStripeBillingPlugin()],
		organizationOptions: {
			sendInvitationEmail: async (data) => {
				await sendEmail(
					data.email,
					invitationEmail({
						inviterName: data.inviter.user.name,
						orgName: data.organization.name,
						url: `${appUrl}/accept-invitation/${data.id}`,
					}),
				);
			},
		},
	};
}
