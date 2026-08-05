/**
 * DB-aware entitlement resolution: loads the org's subscription row
 * (maintained by the @better-auth/stripe webhook) and organization_settings
 * (custom-plan overrides + Claude add-on quantity), then delegates to the pure
 * resolver in @workspace/config/entitlements.
 *
 * Outside cloud mode this never touches the database — the first line resolves
 * to UNLIMITED_ENTITLEMENTS, which is what keeps local/demo/whitelabel
 * provably unaffected by everything built on top of this.
 */

import {
	type Entitlements,
	UNLIMITED_ENTITLEMENTS,
	parseEntitlementOverrides,
	resolveEntitlements,
} from "@workspace/config/entitlements";
import { getDeploymentModeFromEnv } from "@workspace/config/env";
import type { DeploymentMode } from "@workspace/config/types";
import { inArray } from "drizzle-orm";
import { db } from "../db/db";
import { organizationSettings, subscription } from "../db/schema";

type SubscriptionRow = typeof subscription.$inferSelect;
type SettingsRow = typeof organizationSettings.$inferSelect;

/**
 * Statuses ranked from most to least relevant when an org has accumulated
 * several subscription rows (e.g. canceled once, resubscribed). Unknown
 * statuses rank last.
 */
const STATUS_RANK: Record<string, number> = {
	active: 0,
	trialing: 1,
	past_due: 2,
	paused: 3,
	unpaid: 4,
	incomplete: 5,
	incomplete_expired: 6,
	canceled: 7,
};

/**
 * Pick the row that best represents the org's current subscription: the
 * healthiest status wins; among equals, the latest billing period.
 */
export function selectRelevantSubscription(rows: SubscriptionRow[]): SubscriptionRow | null {
	if (rows.length === 0) return null;
	return [...rows].sort((a, b) => {
		const rankA = STATUS_RANK[a.status ?? ""] ?? 99;
		const rankB = STATUS_RANK[b.status ?? ""] ?? 99;
		if (rankA !== rankB) return rankA - rankB;
		return (b.periodEnd?.getTime() ?? 0) - (a.periodEnd?.getTime() ?? 0);
	})[0];
}

function toEntitlements(
	mode: DeploymentMode,
	subscriptionRow: SubscriptionRow | null,
	settingsRow: SettingsRow | null,
	now: Date,
): Entitlements {
	return resolveEntitlements({
		mode,
		subscription: subscriptionRow
			? {
					status: subscriptionRow.status ?? "incomplete",
					plan: subscriptionRow.plan,
					periodEnd: subscriptionRow.periodEnd,
				}
			: null,
		claudeAddonQuantity: settingsRow?.claudeAddonQuantity ?? 0,
		overrides: parseEntitlementOverrides(settingsRow?.entitlementOverrides),
		now,
	});
}

export interface OrgBillingState {
	entitlements: Entitlements;
	/** The row entitlements were derived from (null when none / non-cloud). */
	subscription: SubscriptionRow | null;
	settings: SettingsRow | null;
}

export async function getOrgBillingState(
	orgId: string,
	options?: { mode?: DeploymentMode; now?: Date },
): Promise<OrgBillingState> {
	const mode = options?.mode ?? getDeploymentModeFromEnv(process.env);
	if (mode !== "cloud") {
		return { entitlements: UNLIMITED_ENTITLEMENTS, subscription: null, settings: null };
	}
	const now = options?.now ?? new Date();

	const [subscriptionRows, settingsRows] = await Promise.all([
		db.select().from(subscription).where(inArray(subscription.referenceId, [orgId])),
		db.select().from(organizationSettings).where(inArray(organizationSettings.organizationId, [orgId])),
	]);

	const subscriptionRow = selectRelevantSubscription(subscriptionRows);
	const settingsRow = settingsRows[0] ?? null;
	return {
		entitlements: toEntitlements(mode, subscriptionRow, settingsRow, now),
		subscription: subscriptionRow,
		settings: settingsRow,
	};
}

export async function getOrgEntitlements(
	orgId: string,
	options?: { mode?: DeploymentMode; now?: Date },
): Promise<Entitlements> {
	return (await getOrgBillingState(orgId, options)).entitlements;
}

/**
 * Batch variant for the worker's maintenance sweep: resolve every org in two
 * queries instead of 2N. Every requested org gets an entry.
 */
export async function getOrgEntitlementsMap(
	orgIds: string[],
	options?: { mode?: DeploymentMode; now?: Date },
): Promise<Map<string, Entitlements>> {
	const mode = options?.mode ?? getDeploymentModeFromEnv(process.env);
	const result = new Map<string, Entitlements>();
	if (mode !== "cloud") {
		for (const orgId of orgIds) result.set(orgId, UNLIMITED_ENTITLEMENTS);
		return result;
	}
	if (orgIds.length === 0) return result;
	const now = options?.now ?? new Date();

	const [subscriptionRows, settingsRows] = await Promise.all([
		db.select().from(subscription).where(inArray(subscription.referenceId, orgIds)),
		db.select().from(organizationSettings).where(inArray(organizationSettings.organizationId, orgIds)),
	]);

	const subscriptionsByOrg = new Map<string, SubscriptionRow[]>();
	for (const row of subscriptionRows) {
		const list = subscriptionsByOrg.get(row.referenceId) ?? [];
		list.push(row);
		subscriptionsByOrg.set(row.referenceId, list);
	}
	const settingsByOrg = new Map(settingsRows.map((row) => [row.organizationId, row]));

	for (const orgId of orgIds) {
		const subscriptionRow = selectRelevantSubscription(subscriptionsByOrg.get(orgId) ?? []);
		result.set(orgId, toEntitlements(mode, subscriptionRow, settingsByOrg.get(orgId) ?? null, now));
	}
	return result;
}
