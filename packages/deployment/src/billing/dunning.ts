/**
 * Billing lifecycle notices for org-scoped subscriptions, sent from the
 * Stripe webhook hooks in plugin.ts.
 *
 * Duplicate-send protection is the status transition itself: a notice is only
 * derived when the webhook's previous_attributes carries a prior status, which
 * Stripe includes only when the status actually changed. Routine subscription
 * updates (renewals, item changes, retry bookkeeping) therefore send nothing;
 * a re-delivered event repeats at most one notice, so no per-event send log is
 * kept.
 */

import { DEFAULT_APP_URL } from "@workspace/config/constants";
import { getEnv } from "@workspace/config/env";
import { PAST_DUE_GRACE_DAYS } from "@workspace/config/plans";
import { ORG_ADMIN_ROLES } from "@workspace/config/roles";
import { orgSettingsPath } from "@workspace/lib/app-urls";
import { db } from "@workspace/lib/db/db";
import { member, organization, user } from "@workspace/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { sendEmail } from "../email";
import {
	type EmailContent,
	paymentFailedEmail,
	paymentRecoveredEmail,
	subscriptionEndedEmail,
} from "../email-templates";

export type DunningNotice = "payment-failed" | "payment-recovered" | "subscription-ended";

/**
 * Which notice a webhook status change warrants. `previousStatus` comes from
 * the event's previous_attributes and is undefined when the status did not
 * change.
 */
export function dunningNoticeForStatusChange(previousStatus: string | undefined, status: string): DunningNotice | null {
	if (!previousStatus || previousStatus === status) return null;
	if (status === "past_due") return "payment-failed";
	if (status === "active" && (previousStatus === "past_due" || previousStatus === "unpaid")) {
		return "payment-recovered";
	}
	// Stripe accounts configured to mark exhausted retries unpaid (rather than
	// cancel) end the subscription through an update, not a deleted event.
	if (status === "unpaid") return "subscription-ended";
	return null;
}

/** Billing email goes to whoever could act on it — the same roles that may manage the plan. */
async function billingRecipients(organizationId: string): Promise<string[]> {
	const rows = await db
		.select({ email: user.email })
		.from(member)
		.innerJoin(user, eq(member.userId, user.id))
		.where(and(eq(member.organizationId, organizationId), inArray(member.role, [...ORG_ADMIN_ROLES])));
	return [...new Set(rows.map((row) => row.email))];
}

export async function sendDunningNotice(organizationId: string, notice: DunningNotice): Promise<void> {
	// Same total accessor createCloudDeployment uses, so a missing APP_URL
	// surfaces on the env-validation page instead of emailing "undefined/app/…".
	const appUrl = getEnv("APP_URL", DEFAULT_APP_URL).replace(/\/+$/, "");
	const [[org], recipients] = await Promise.all([
		db
			.select({ name: organization.name, slug: organization.slug })
			.from(organization)
			.where(eq(organization.id, organizationId))
			.limit(1),
		billingRecipients(organizationId),
	]);
	if (!org || recipients.length === 0) return;

	const url = `${appUrl}${orgSettingsPath(org, "billing")}`;
	const content: EmailContent =
		notice === "payment-failed"
			? paymentFailedEmail({ orgName: org.name, graceDays: PAST_DUE_GRACE_DAYS, url })
			: notice === "payment-recovered"
				? paymentRecoveredEmail({ orgName: org.name, url })
				: subscriptionEndedEmail({ orgName: org.name, url });

	// One recipient's failure shouldn't block the rest.
	const results = await Promise.allSettled(recipients.map((to) => sendEmail(to, content)));
	for (const result of results) {
		if (result.status === "rejected") {
			console.error(`[billing] dunning email (${notice}) failed for org ${organizationId}:`, result.reason);
		}
	}
}
