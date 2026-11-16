/** Outside cloud this never touches the database: it resolves straight to UNLIMITED_ENTITLEMENTS. */

import {
	type Entitlements,
	parseEntitlementOverrides,
	resolveEntitlements,
	UNLIMITED_ENTITLEMENTS,
} from "@workspace/config/entitlements";
import { getDeploymentModeFromEnv } from "@workspace/config/env";
import type { DeploymentMode } from "@workspace/config/types";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db/db";
import type { DbConnection } from "../db/db-connection";
import { brands, organizationSettings, subscription } from "../db/schema";

type SubscriptionRow = typeof subscription.$inferSelect;
type SettingsRow = typeof organizationSettings.$inferSelect;

/** For orgs with several subscription rows (canceled once, resubscribed). Unknown statuses rank last. */
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

/** The healthiest status wins; among equals, the latest billing period. */
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
		premiumAddonQuantity: settingsRow?.premiumAddonQuantity ?? 0,
		overrides: parseEntitlementOverrides(settingsRow?.entitlementOverrides),
		now,
	});
}

/** Access control is the caller's concern. */
export async function getBrandOrganizationId(brandId: string): Promise<string> {
	const [row] = await db
		.select({ organizationId: brands.organizationId })
		.from(brands)
		.where(eq(brands.id, brandId))
		.limit(1);
	if (!row) throw new Error(`Brand not found: ${brandId}`);
	return row.organizationId;
}

export interface OrgBillingState {
	entitlements: Entitlements;
	subscription: SubscriptionRow | null;
	settings: SettingsRow | null;
}

const UNLIMITED_STATE: OrgBillingState = {
	entitlements: UNLIMITED_ENTITLEMENTS,
	subscription: null,
	settings: null,
};

/**
 * Every requested org gets an entry. Pass `conn` to read on the caller's open
 * transaction: a second pooled connection while one is held can deadlock the pool.
 */
export interface EntitlementReadOptions {
	mode?: DeploymentMode;
	now?: Date;
	conn?: DbConnection;
}

export async function getOrgBillingStates(
	orgIds: string[],
	options?: EntitlementReadOptions,
): Promise<Map<string, OrgBillingState>> {
	const conn = options?.conn ?? db;
	const mode = options?.mode ?? getDeploymentModeFromEnv(process.env);
	const result = new Map<string, OrgBillingState>();
	if (mode !== "cloud") {
		for (const orgId of orgIds) result.set(orgId, UNLIMITED_STATE);
		return result;
	}
	if (orgIds.length === 0) return result;
	const now = options?.now ?? new Date();

	const [subscriptionRows, settingsRows] = await Promise.all([
		conn.select().from(subscription).where(inArray(subscription.referenceId, orgIds)),
		conn.select().from(organizationSettings).where(inArray(organizationSettings.organizationId, orgIds)),
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
		const settingsRow = settingsByOrg.get(orgId) ?? null;
		result.set(orgId, {
			entitlements: toEntitlements(mode, subscriptionRow, settingsRow, now),
			subscription: subscriptionRow,
			settings: settingsRow,
		});
	}
	return result;
}

export async function getOrgBillingState(orgId: string, options?: EntitlementReadOptions): Promise<OrgBillingState> {
	const states = await getOrgBillingStates([orgId], options);
	// getOrgBillingStates populates every requested id; the fallback only narrows.
	return states.get(orgId) ?? UNLIMITED_STATE;
}

export async function getOrgEntitlements(orgId: string, options?: EntitlementReadOptions): Promise<Entitlements> {
	return (await getOrgBillingState(orgId, options)).entitlements;
}

export async function getOrgEntitlementsMap(
	orgIds: string[],
	options?: EntitlementReadOptions,
): Promise<Map<string, Entitlements>> {
	const states = await getOrgBillingStates(orgIds, options);
	return new Map([...states].map(([orgId, state]) => [orgId, state.entitlements]));
}
