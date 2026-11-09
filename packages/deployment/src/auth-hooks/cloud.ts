import type { CreateAuthOptions } from "@workspace/lib/auth/server";
import { provisionUmbrellaOrg } from "@workspace/lib/db/provisioning";
import type { BetterAuthPlugin } from "better-auth";
import { APIError } from "better-auth/api";
import { captcha, lastLoginMethod } from "better-auth/plugins";
import { createStripeBillingPlugin } from "../billing/plugin";
import { isDisposableEmail } from "../disposable-domains";
import { sendEmail } from "../email";
import { invitationEmail, passwordResetEmail, verificationEmail } from "../email-templates";

/**
 * Entries are an exact address ("alice@partner.com"), a whole domain
 * ("@elmohq.com", never a lookalike like "evil-elmohq.com"), or "*" for everyone.
 * Case-insensitive. An empty allowlist denies everyone, so cloud fails closed.
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

// Sign-in is included because an unverified sign-in resends the verification email.
const TURNSTILE_PROTECTED_ENDPOINTS = [
	"/sign-up/email",
	"/sign-in/email",
	"/request-password-reset",
	"/send-verification-email",
];

// Cloudflare's test secrets verify every token as solved on example.com.
const TURNSTILE_TEST_SECRET = /^[123]x0{20,}/;

function createTurnstilePlugin(): BetterAuthPlugin | undefined {
	const secretKey = process.env.TURNSTILE_SECRET_KEY?.trim();
	if (!secretKey || !process.env.VITE_TURNSTILE_SITE_KEY?.trim()) {
		console.warn(
			"[auth] TURNSTILE_SECRET_KEY and VITE_TURNSTILE_SITE_KEY are not both set: email sign-up, sign-in, and password reset have no bot protection.",
		);
		return undefined;
	}
	return captcha({
		provider: "cloudflare-turnstile",
		secretKey,
		endpoints: TURNSTILE_PROTECTED_ENDPOINTS,
		allowedHostnames: TURNSTILE_TEST_SECRET.test(secretKey) ? undefined : [new URL(process.env.APP_URL!).hostname],
	});
}

export function getCloudAuthOptions(): CreateAuthOptions {
	const appUrl = process.env.APP_URL!;
	const turnstile = createTurnstilePlugin();
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
						// Every prompt run costs provider money, so throwaway signups are refused.
						if (isDisposableEmail(user.email)) {
							throw new APIError("BAD_REQUEST", {
								message: "Disposable email addresses are not supported. Please use your work or personal email.",
							});
						}
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
		extraPlugins: [createStripeBillingPlugin(), lastLoginMethod(), ...(turnstile ? [turnstile] : [])],
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
