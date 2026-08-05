import * as Sentry from "@sentry/node";
import {
	getProviderCostEstimate,
	type ProviderCostEstimates,
	parseProviderCostEstimates,
	validateProviderCostEstimateCoverage,
} from "@workspace/config/provider-costs";
import { getTrackingTargetKey, type ModelConfig, parseScrapeTargets } from "@workspace/config/scrape-targets";
import { db } from "@workspace/lib/db/db";
import { sql } from "drizzle-orm";
import type { JobWithMetadata } from "pg-boss";

export const CLOUD_PROVIDER_SPEND_REPORT_QUEUE = "report-cloud-provider-spend-v1";
export const CLOUD_PROVIDER_SPEND_REPORT_SCHEDULE = {
	cron: "15 1 * * *",
	key: "previous-complete-utc-day-v1",
	options: {
		tz: "UTC",
		singletonKey: "previous-complete-utc-day-v1",
		singletonSeconds: 24 * 60 * 60,
		singletonNextSlot: false,
	},
} as const;

export interface CloudProviderSpendReportData {
	version: 1;
}

export interface SpendForecastRow {
	organizationId: string;
	planProjectionAtReportTime: string;
	targetKey: string;
	provider: string;
	scheduledTasks: number;
}

export interface SpendActualRow {
	organizationId: string;
	planProjectionAtReportTime: string;
	targetKey: string;
	provider: string;
	startedAttempts: number;
	missingCostAttempts: number;
	actualMicrousd: number;
}

export interface CloudProviderSpendStore {
	loadRows(input: {
		periodStart: Date;
		periodEnd: Date;
		projectionAt: Date;
	}): Promise<{ forecast: SpendForecastRow[]; actual: SpendActualRow[] }>;
}

export type SpendAnomalyReason = "actual-estimate-over-forecast" | "missing-cost" | "started-attempts-over-scheduled";

export interface OrganizationSpendSummary {
	organizationId: string;
	/** Current projection, not a historical plan snapshot. */
	planProjectionAtReportTime: string;
	scheduledTasks: number;
	startedAttempts: number;
	missingCostAttempts: number;
	forecastMicrousd: number;
	actualMicrousd: number;
	anomalyReasons: SpendAnomalyReason[];
}

export interface SpendDimensionSummary {
	key: string;
	scheduledTasks: number;
	startedAttempts: number;
	missingCostAttempts: number;
	forecastMicrousd: number;
	actualMicrousd: number;
}

export interface CloudProviderSpendReport {
	day: string;
	periodStart: Date;
	periodEnd: Date;
	projectionAt: Date;
	planGrouping: "current-projection-at-report-time";
	totals: Omit<SpendDimensionSummary, "key"> & { organizations: number; anomalousOrganizations: number };
	organizations: OrganizationSpendSummary[];
	targets: SpendDimensionSummary[];
	providers: SpendDimensionSummary[];
	plansAtReportTime: SpendDimensionSummary[];
}

export interface CloudProviderSpendReporter {
	reportSummary(report: CloudProviderSpendReport): void;
	reportOrganization(summary: OrganizationSpendSummary, report: CloudProviderSpendReport): void;
	reportAnomaly(summary: OrganizationSpendSummary, report: CloudProviderSpendReport): void;
}

interface CombinedSpendRow {
	row_kind: "actual" | "forecast";
	organization_id: string;
	plan_projection_at_report_time: string;
	target_key: string;
	provider: string | null;
	units: number | string;
	missing_cost_attempts: number | string;
	actual_microusd: number | string;
}

function databaseInteger(value: number | string, label: string): number {
	const parsed = typeof value === "number" ? value : Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${label} returned by provider spend query`);
	return parsed;
}

export function createCloudProviderSpendStore(): CloudProviderSpendStore {
	return {
		async loadRows({ periodStart, periodEnd, projectionAt }) {
			const result = await db.execute(sql`
				WITH forecast AS (
					SELECT
						brand.organization_id,
						task.target_key,
						occurrence.policy_snapshot->>'provider' AS provider,
						count(*)::bigint AS scheduled_tasks
					FROM tracking_tasks task
					JOIN tracking_occurrences occurrence ON occurrence.id = task.occurrence_id
					JOIN brands brand ON brand.id = task.brand_id
					WHERE occurrence.due_at >= ${periodStart} AND occurrence.due_at < ${periodEnd}
					GROUP BY brand.organization_id, task.target_key, occurrence.policy_snapshot->>'provider'
				), actual AS (
					SELECT
						attempt.organization_id,
						attempt.target_key,
						attempt.provider,
						count(*)::bigint AS started_attempts,
						count(*) FILTER (WHERE attempt.cost_microusd IS NULL)::bigint AS missing_cost_attempts,
						coalesce(sum(attempt.cost_microusd), 0)::bigint AS actual_microusd
					FROM tracking_provider_attempts attempt
					WHERE attempt.started_at >= ${periodStart} AND attempt.started_at < ${periodEnd}
					GROUP BY attempt.organization_id, attempt.target_key, attempt.provider
				), report_organizations AS (
					SELECT organization_id FROM forecast
					UNION
					SELECT organization_id FROM actual
				), plan_projection AS (
					SELECT
						report_organization.organization_id,
						CASE
							WHEN EXISTS (
								SELECT 1
								FROM organization_entitlement_overrides entitlement_override
								WHERE entitlement_override.organization_id = report_organization.organization_id
									AND entitlement_override.effective_from <= ${projectionAt}
									AND (entitlement_override.effective_until IS NULL OR entitlement_override.effective_until > ${projectionAt})
									AND (entitlement_override.revoked_at IS NULL OR entitlement_override.revoked_at > ${projectionAt})
							) THEN 'custom'
							ELSE coalesce(subscription.base_plan_key, 'unassigned')
						END AS plan_projection_at_report_time
					FROM report_organizations report_organization
					LEFT JOIN organization_billing_subscriptions subscription
						ON subscription.organization_id = report_organization.organization_id
				)
				SELECT
					'forecast'::text AS row_kind,
					forecast.organization_id,
					plan_projection.plan_projection_at_report_time,
					forecast.target_key,
					forecast.provider,
					forecast.scheduled_tasks AS units,
					0::bigint AS missing_cost_attempts,
					0::bigint AS actual_microusd
				FROM forecast
				JOIN plan_projection ON plan_projection.organization_id = forecast.organization_id
				UNION ALL
				SELECT
					'actual'::text AS row_kind,
					actual.organization_id,
					plan_projection.plan_projection_at_report_time,
					actual.target_key,
					actual.provider,
					actual.started_attempts AS units,
					actual.missing_cost_attempts,
					actual.actual_microusd
				FROM actual
				JOIN plan_projection ON plan_projection.organization_id = actual.organization_id
				ORDER BY organization_id, target_key, row_kind, provider
			`);

			const forecast: SpendForecastRow[] = [];
			const actual: SpendActualRow[] = [];
			for (const row of result.rows as unknown as CombinedSpendRow[]) {
				if (row.row_kind === "forecast") {
					if (!row.provider) throw new Error("Provider spend forecast row is missing its snapshot provider identity");
					forecast.push({
						organizationId: row.organization_id,
						planProjectionAtReportTime: row.plan_projection_at_report_time,
						targetKey: row.target_key,
						provider: row.provider,
						scheduledTasks: databaseInteger(row.units, "scheduled task count"),
					});
					continue;
				}
				if (!row.provider) throw new Error("Provider spend actual row is missing its provider identity");
				actual.push({
					organizationId: row.organization_id,
					planProjectionAtReportTime: row.plan_projection_at_report_time,
					targetKey: row.target_key,
					provider: row.provider,
					startedAttempts: databaseInteger(row.units, "started attempt count"),
					missingCostAttempts: databaseInteger(row.missing_cost_attempts, "missing-cost attempt count"),
					actualMicrousd: databaseInteger(row.actual_microusd, "actual estimated cost"),
				});
			}
			return { forecast, actual };
		},
	};
}

function safeAdd(left: number, right: number, label: string): number {
	const result = left + right;
	if (!Number.isSafeInteger(result) || result < 0) throw new Error(`${label} exceeds safe integer range`);
	return result;
}

function safeMultiply(left: number, right: number, label: string): number {
	const result = left * right;
	if (!Number.isSafeInteger(result) || result < 0) throw new Error(`${label} exceeds safe integer range`);
	return result;
}

function emptyDimension(key: string): SpendDimensionSummary {
	return {
		key,
		scheduledTasks: 0,
		startedAttempts: 0,
		missingCostAttempts: 0,
		forecastMicrousd: 0,
		actualMicrousd: 0,
	};
}

function dimension(map: Map<string, SpendDimensionSummary>, key: string): SpendDimensionSummary {
	let summary = map.get(key);
	if (!summary) {
		summary = emptyDimension(key);
		map.set(key, summary);
	}
	return summary;
}

function addForecast(summary: SpendDimensionSummary, tasks: number, costMicrousd: number): void {
	summary.scheduledTasks = safeAdd(summary.scheduledTasks, tasks, "scheduled task count");
	summary.forecastMicrousd = safeAdd(summary.forecastMicrousd, costMicrousd, "forecast cost");
}

function addActual(summary: SpendDimensionSummary, row: SpendActualRow): void {
	summary.startedAttempts = safeAdd(summary.startedAttempts, row.startedAttempts, "started attempt count");
	summary.missingCostAttempts = safeAdd(
		summary.missingCostAttempts,
		row.missingCostAttempts,
		"missing-cost attempt count",
	);
	summary.actualMicrousd = safeAdd(summary.actualMicrousd, row.actualMicrousd, "actual cost");
}

function sortedDimensions(map: Map<string, SpendDimensionSummary>): SpendDimensionSummary[] {
	return [...map.values()].sort(
		(left, right) => right.actualMicrousd - left.actualMicrousd || left.key.localeCompare(right.key),
	);
}

export function previousCompleteUtcDay(now: Date): { day: string; periodStart: Date; periodEnd: Date } {
	const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
	const periodStart = new Date(periodEnd.getTime() - 24 * 60 * 60 * 1000);
	return { day: periodStart.toISOString().slice(0, 10), periodStart, periodEnd };
}

export function buildCloudProviderSpendReport(input: {
	day: string;
	periodStart: Date;
	periodEnd: Date;
	projectionAt: Date;
	forecast: SpendForecastRow[];
	actual: SpendActualRow[];
	targets: readonly ModelConfig[];
	estimates: ProviderCostEstimates;
}): CloudProviderSpendReport {
	validateProviderCostEstimateCoverage(input.estimates, input.targets);
	const configByTarget = new Map(input.targets.map((target) => [getTrackingTargetKey(target), target]));
	const organizations = new Map<string, OrganizationSpendSummary>();
	const targetSummaries = new Map<string, SpendDimensionSummary>();
	const providerSummaries = new Map<string, SpendDimensionSummary>();

	function organization(organizationId: string, planProjectionAtReportTime: string): OrganizationSpendSummary {
		let summary = organizations.get(organizationId);
		if (!summary) {
			summary = {
				organizationId,
				planProjectionAtReportTime,
				scheduledTasks: 0,
				startedAttempts: 0,
				missingCostAttempts: 0,
				forecastMicrousd: 0,
				actualMicrousd: 0,
				anomalyReasons: [],
			};
			organizations.set(organizationId, summary);
		} else if (summary.planProjectionAtReportTime !== planProjectionAtReportTime) {
			throw new Error(`Inconsistent report-time plan projection for organization ${organizationId}`);
		}
		return summary;
	}

	for (const row of input.forecast) {
		const config = configByTarget.get(row.targetKey);
		if (!config) throw new Error(`Forecast references unconfigured target "${row.targetKey}"`);
		const forecastMicrousd = safeMultiply(
			row.scheduledTasks,
			getProviderCostEstimate(input.estimates, row.targetKey),
			`forecast cost for ${row.targetKey}`,
		);
		const organizationSummary = organization(row.organizationId, row.planProjectionAtReportTime);
		organizationSummary.scheduledTasks = safeAdd(
			organizationSummary.scheduledTasks,
			row.scheduledTasks,
			"organization scheduled task count",
		);
		organizationSummary.forecastMicrousd = safeAdd(
			organizationSummary.forecastMicrousd,
			forecastMicrousd,
			"organization forecast cost",
		);
		addForecast(dimension(targetSummaries, row.targetKey), row.scheduledTasks, forecastMicrousd);
		addForecast(dimension(providerSummaries, row.provider), row.scheduledTasks, forecastMicrousd);
	}

	for (const row of input.actual) {
		const organizationSummary = organization(row.organizationId, row.planProjectionAtReportTime);
		organizationSummary.startedAttempts = safeAdd(
			organizationSummary.startedAttempts,
			row.startedAttempts,
			"organization started attempt count",
		);
		organizationSummary.missingCostAttempts = safeAdd(
			organizationSummary.missingCostAttempts,
			row.missingCostAttempts,
			"organization missing-cost attempt count",
		);
		organizationSummary.actualMicrousd = safeAdd(
			organizationSummary.actualMicrousd,
			row.actualMicrousd,
			"organization actual cost",
		);
		addActual(dimension(targetSummaries, row.targetKey), row);
		addActual(dimension(providerSummaries, row.provider), row);
	}

	const organizationSummaries = [...organizations.values()];
	for (const summary of organizationSummaries) {
		if (summary.missingCostAttempts > 0) summary.anomalyReasons.push("missing-cost");
		if (summary.startedAttempts > summary.scheduledTasks) {
			summary.anomalyReasons.push("started-attempts-over-scheduled");
		}
		if (summary.actualMicrousd > summary.forecastMicrousd) {
			summary.anomalyReasons.push("actual-estimate-over-forecast");
		}
	}
	organizationSummaries.sort(
		(left, right) =>
			Number(right.anomalyReasons.length > 0) - Number(left.anomalyReasons.length > 0) ||
			right.actualMicrousd - left.actualMicrousd ||
			left.organizationId.localeCompare(right.organizationId),
	);

	const planSummaries = new Map<string, SpendDimensionSummary>();
	for (const summary of organizationSummaries) {
		const plan = dimension(planSummaries, summary.planProjectionAtReportTime);
		plan.scheduledTasks = safeAdd(plan.scheduledTasks, summary.scheduledTasks, "plan scheduled task count");
		plan.startedAttempts = safeAdd(plan.startedAttempts, summary.startedAttempts, "plan started attempt count");
		plan.missingCostAttempts = safeAdd(
			plan.missingCostAttempts,
			summary.missingCostAttempts,
			"plan missing-cost attempt count",
		);
		plan.forecastMicrousd = safeAdd(plan.forecastMicrousd, summary.forecastMicrousd, "plan forecast cost");
		plan.actualMicrousd = safeAdd(plan.actualMicrousd, summary.actualMicrousd, "plan actual cost");
	}

	const totals = organizationSummaries.reduce(
		(total, summary) => ({
			organizations: total.organizations + 1,
			anomalousOrganizations: total.anomalousOrganizations + Number(summary.anomalyReasons.length > 0),
			scheduledTasks: safeAdd(total.scheduledTasks, summary.scheduledTasks, "total scheduled task count"),
			startedAttempts: safeAdd(total.startedAttempts, summary.startedAttempts, "total started attempt count"),
			missingCostAttempts: safeAdd(
				total.missingCostAttempts,
				summary.missingCostAttempts,
				"total missing-cost attempt count",
			),
			forecastMicrousd: safeAdd(total.forecastMicrousd, summary.forecastMicrousd, "total forecast cost"),
			actualMicrousd: safeAdd(total.actualMicrousd, summary.actualMicrousd, "total actual cost"),
		}),
		{
			organizations: 0,
			anomalousOrganizations: 0,
			scheduledTasks: 0,
			startedAttempts: 0,
			missingCostAttempts: 0,
			forecastMicrousd: 0,
			actualMicrousd: 0,
		},
	);

	return {
		day: input.day,
		periodStart: input.periodStart,
		periodEnd: input.periodEnd,
		projectionAt: input.projectionAt,
		planGrouping: "current-projection-at-report-time",
		totals,
		organizations: organizationSummaries,
		targets: sortedDimensions(targetSummaries),
		providers: sortedDimensions(providerSummaries),
		plansAtReportTime: sortedDimensions(planSummaries),
	};
}

const MAX_SENTRY_DIMENSION_ROWS = 25;
const MAX_SENTRY_ORGANIZATION_ROWS = 25;

function boundedRows(rows: unknown[], maximum: number): Record<string, string | number> {
	const bounded: Record<string, string | number> = {
		included: Math.min(rows.length, maximum),
		total: rows.length,
	};
	for (const [index, row] of rows.slice(0, maximum).entries()) {
		bounded[`row_${index + 1}`] = JSON.stringify(row).slice(0, 1500);
	}
	return bounded;
}

function microusdToUsd(microusd: number): string {
	return (microusd / 1_000_000).toFixed(6);
}

export function createSentryCloudProviderSpendReporter(): CloudProviderSpendReporter {
	return {
		reportSummary(report) {
			Sentry.withScope((scope) => {
				scope.setLevel("info");
				scope.setTag("cloud_spend_report", "daily");
				scope.setTag("report_day", report.day);
				scope.setFingerprint(["cloud-provider-spend-daily-summary"]);
				scope.setContext("totals", report.totals);
				scope.setContext("providers", boundedRows(report.providers, MAX_SENTRY_DIMENSION_ROWS));
				scope.setContext("targets", boundedRows(report.targets, MAX_SENTRY_DIMENSION_ROWS));
				scope.setContext("plans_at_report_time", boundedRows(report.plansAtReportTime, MAX_SENTRY_DIMENSION_ROWS));
				scope.setContext("top_organizations", boundedRows(report.organizations, MAX_SENTRY_ORGANIZATION_ROWS));
				scope.setContext("projection", {
					at: report.projectionAt.toISOString(),
					planGrouping: report.planGrouping,
					note: "Attempts do not snapshot plans; plan grouping is the current projection at report time.",
				});
				Sentry.captureMessage(
					`Cloud provider spend ${report.day}: $${microusdToUsd(report.totals.actualMicrousd)} actual estimate vs $${microusdToUsd(report.totals.forecastMicrousd)} forecast`,
					"info",
				);
			});
		},
		reportOrganization(summary, report) {
			console.log(
				`[cloud-provider-spend] ${JSON.stringify({
					day: report.day,
					planGrouping: report.planGrouping,
					...summary,
				})}`,
			);
		},
		reportAnomaly(summary, report) {
			Sentry.withScope((scope) => {
				scope.setLevel("warning");
				scope.setTag("cloud_spend_alert", "organization-anomaly");
				scope.setTag("report_day", report.day);
				scope.setTag("organization_id", summary.organizationId);
				scope.setTag("plan_projection_at_report_time", summary.planProjectionAtReportTime);
				scope.setFingerprint(["cloud-provider-spend-organization-anomaly", summary.organizationId]);
				scope.setContext("organization_spend", {
					...summary,
					anomalyReasons: summary.anomalyReasons.join(","),
				});
				Sentry.captureMessage(
					`Cloud provider spend anomaly for organization ${summary.organizationId}: ${summary.anomalyReasons.join(", ")}`,
					"warning",
				);
			});
		},
	};
}

export async function reportCloudProviderSpend(input: {
	now: Date;
	dayReference?: Date;
	targets: readonly ModelConfig[];
	estimates: ProviderCostEstimates;
	store: CloudProviderSpendStore;
	reporter: CloudProviderSpendReporter;
}): Promise<CloudProviderSpendReport> {
	const { day, periodStart, periodEnd } = previousCompleteUtcDay(input.dayReference ?? input.now);
	const rows = await input.store.loadRows({ periodStart, periodEnd, projectionAt: input.now });
	const report = buildCloudProviderSpendReport({
		day,
		periodStart,
		periodEnd,
		projectionAt: input.now,
		...rows,
		targets: input.targets,
		estimates: input.estimates,
	});
	input.reporter.reportSummary(report);
	for (const organization of report.organizations) {
		input.reporter.reportOrganization(organization, report);
		if (organization.anomalyReasons.length > 0) input.reporter.reportAnomaly(organization, report);
	}
	return report;
}

export async function reportCloudProviderSpendJob(
	jobs: JobWithMetadata<CloudProviderSpendReportData>[],
): Promise<void> {
	if (process.env.DEPLOYMENT_MODE !== "cloud") return;
	const targets = parseScrapeTargets(process.env.SCRAPE_TARGETS);
	const estimates = parseProviderCostEstimates(process.env.CLOUD_TRACKING_COST_ESTIMATES);
	validateProviderCostEstimateCoverage(estimates, targets);
	for (const job of jobs) {
		if (job.data.version !== 1) throw new Error(`Unsupported cloud provider spend payload: ${job.data.version}`);
		await reportCloudProviderSpend({
			now: new Date(),
			dayReference: job.createdOn,
			targets,
			estimates,
			store: createCloudProviderSpendStore(),
			reporter: createSentryCloudProviderSpendReporter(),
		});
	}
}
