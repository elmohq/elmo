/**
 * Cloud auth options for better-auth.
 *
 * Public self-serve signup: email/password with required verification,
 * Google OAuth, Resend transactional email, and disposable-domain blocking.
 * Org provisioning stays in the create-brand flow — no user.create.after hook.
 */
import { APIError } from "better-auth/api";
import type { CreateAuthOptions } from "@workspace/lib/auth/server";
import { isDisposableEmail } from "./disposable-domains";
import { sendEmail } from "./email";
import { invitationEmail, passwordResetEmail, verificationEmail } from "./email-templates";

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
						// throwaway signups are rejected outright. Covers both
						// email/password and OAuth user creation.
						if (isDisposableEmail(user.email)) {
							throw new APIError("BAD_REQUEST", {
								message: "Disposable email addresses are not supported. Please use your work or personal email.",
							});
						}
					},
				},
			},
		},
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
