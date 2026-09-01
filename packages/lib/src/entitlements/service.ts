/**
 * DB-aware entitlement resolution: loads the org's subscription row
 * (maintained by the @better-auth/stripe webhook) and organization_settings
 * (custom-plan overrides + premium add-on quantity), then delegates to the pure
 * resolver in @workspace/config/entitlements.
 *
 * Outside cloud mode this never touches the database — the first line resolves
 * to UNLIMITED_ENTITLEMENTS, which is what keeps local/demo/whitelabel
 * provably unaffected by everything built on top of this.
 */

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
		premiumAddonQuantity: settingsRow?.premiumAddonQuantity ?? 0,
		overrides: parseEntitlementOverrides(settingsRow?.entitlementOverrides),
		now,
	});
}

/**
 * The org a brand belongs to, for callers that hold only a brand id and no
 * user context (the admin surface, /api/v1 key auth, the worker). Access
 * control is the caller's concern; this is pure tenancy resolution.
 */
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
	/** The row entitlements were derived from (null when none / non-cloud). */
	subscription: SubscriptionRow | null;
	settings: SettingsRow | null;
}

const UNLIMITED_STATE: OrgBillingState = {
	entitlements: UNLIMITED_ENTITLEMENTS,
	subscription: null,
	settings: null,
};

/**
 * Billing state for any number of orgs in two queries. Every requested org gets
 * an entry, so callers never have to distinguish "no row" from "not asked for".
 *
 * The single-org accessors below all funnel through here rather than issuing
 * their own one-row variants of the same two queries — one query shape, one
 * place that decides which subscription row wins.
 */
/**
 * `conn` runs the read on a transaction the caller already opened. Quota
 * decisions need it: checking usage on a second pooled connection while
 * holding a transaction open can exhaust the pool and deadlock.
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
	// getOrgBillingStates always populates every requested id; the fallback is a
	// type narrowing, not a case that happens.
	return states.get(orgId) ?? UNLIMITED_STATE;
}

export async function getOrgEntitlements(orgId: string, options?: EntitlementReadOptions): Promise<Entitlements> {
	return (await getOrgBillingState(orgId, options)).entitlements;
}

/** Entitlements only, for callers (the worker sweep, the paywall) with no use for the rows. */
export async function getOrgEntitlementsMap(
	orgIds: string[],
	options?: EntitlementReadOptions,
): Promise<Map<string, Entitlements>> {
	const states = await getOrgBillingStates(orgIds, options);
	return new Map([...states].map(([orgId, state]) => [orgId, state.entitlements]));
}
