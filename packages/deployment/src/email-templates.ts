/**
 * Transactional email templates for cloud auth flows.
 *
 * Pure template functions — no I/O — so they're unit-testable without
 * mocking Resend. All interpolated user-controlled strings (inviter name,
 * organization name) are HTML-escaped before landing in markup.
 */

export interface EmailContent {
	subject: string;
	html: string;
	text: string;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function wrapHtml(heading: string, sentence: string, url: string, cta = "Continue"): string {
	return `
		<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
			<h1 style="font-size: 20px;">${heading}</h1>
			<p>${sentence}</p>
			<p>
				<a href="${url}" style="display: inline-block; padding: 10px 20px; background-color: #111827; color: #ffffff; text-decoration: none; border-radius: 6px;">
					${cta}
				</a>
			</p>
			<p style="color: #6b7280; font-size: 13px;">
				If the button doesn't work, copy and paste this link into your browser: ${url}
			</p>
		</div>
	`.trim();
}

export function verificationEmail(input: { url: string }): EmailContent {
	const { url } = input;
	return {
		subject: "Verify your email address",
		html: wrapHtml(
			"Verify your email address",
			"Click the button below to verify your email and finish signing up.",
			url,
		),
		text: `Verify your email address by visiting this link: ${url}`,
	};
}

export function passwordResetEmail(input: { url: string }): EmailContent {
	const { url } = input;
	return {
		subject: "Reset your Elmo password",
		html: wrapHtml("Reset your password", "Click the button below to choose a new password.", url),
		text: `Reset your Elmo password by visiting this link: ${url}`,
	};
}

export function invitationEmail(input: { inviterName: string; orgName: string; url: string }): EmailContent {
	const { inviterName, orgName, url } = input;
	const safeInviterName = escapeHtml(inviterName);
	const safeOrgName = escapeHtml(orgName);
	return {
		subject: `${inviterName} invited you to ${orgName} on Elmo`,
		html: wrapHtml(
			`You've been invited to join ${safeOrgName}`,
			`${safeInviterName} invited you to join ${safeOrgName} on Elmo. Click the button below to accept.`,
			url,
		),
		text: `${inviterName} invited you to join ${orgName} on Elmo. Accept the invitation here: ${url}`,
	};
}

export function paymentFailedEmail(input: { orgName: string; graceDays: number; url: string }): EmailContent {
	const { orgName, graceDays, url } = input;
	const safeOrgName = escapeHtml(orgName);
	return {
		subject: `Payment failed for ${orgName} on Elmo`,
		html: wrapHtml(
			"Payment failed",
			`We couldn't renew the subscription for the ${safeOrgName} organization. Tracking continues while Stripe retries, but it pauses after ${graceDays} days unless a payment succeeds — update your card in the billing portal to avoid an interruption.`,
			url,
			"Update payment method",
		),
		text: `We couldn't renew the subscription for the ${orgName} organization. Update your card within ${graceDays} days to keep tracking running: ${url}`,
	};
}

export function paymentRecoveredEmail(input: { orgName: string; url: string }): EmailContent {
	const { orgName, url } = input;
	const safeOrgName = escapeHtml(orgName);
	return {
		subject: `Payment received for ${orgName} on Elmo`,
		html: wrapHtml(
			"You're all set",
			`Payment for the ${safeOrgName} organization went through and the subscription is active again. No further action is needed.`,
			url,
			"View billing",
		),
		text: `Payment for the ${orgName} organization went through and the subscription is active again. No further action is needed. View billing: ${url}`,
	};
}

export function subscriptionEndedEmail(input: { orgName: string; url: string }): EmailContent {
	const { orgName, url } = input;
	const safeOrgName = escapeHtml(orgName);
	return {
		subject: `Your Elmo subscription for ${orgName} has ended`,
		html: wrapHtml(
			"Subscription ended",
			`The subscription for the ${safeOrgName} organization has ended, so prompt tracking is stopped. Your existing data stays viewable, and choosing a plan restarts tracking.`,
			url,
			"View billing",
		),
		text: `The subscription for the ${orgName} organization has ended, so prompt tracking is stopped. Your existing data stays viewable, and choosing a plan restarts tracking. View billing: ${url}`,
	};
}
