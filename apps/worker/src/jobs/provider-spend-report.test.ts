import { describe, expect, it, vi } from "vitest";
import {
	buildCloudProviderSpendReport,
	CLOUD_PROVIDER_SPEND_REPORT_SCHEDULE,
	type CloudProviderSpendReporter,
	type CloudProviderSpendStore,
	previousCompleteUtcDay,
	reportCloudProviderSpend,
} from "./provider-spend-report";

const targets = [
	{ targetKey: "chatgpt", model: "chatgpt", provider: "olostep", webSearch: true },
	{ targetKey: "claude-native-web", model: "claude", provider: "anthropic-api", webSearch: true },
] as const;
const estimates = { chatgpt: 100, "claude-native-web": 250 };
const projectionAt = new Date("2026-08-05T12:34:56Z");
const { day, periodStart, periodEnd } = previousCompleteUtcDay(projectionAt);
const rows = {
	forecast: [
		{
			organizationId: "org-a",
			planProjectionAtReportTime: "pro",
			targetKey: "chatgpt",
			provider: "olostep",
			scheduledTasks: 2,
		},
		{
			organizationId: "org-b",
			planProjectionAtReportTime: "basic",
			targetKey: "chatgpt",
			provider: "olostep",
			scheduledTasks: 2,
		},
		{
			organizationId: "org-c",
			planProjectionAtReportTime: "pro",
			targetKey: "claude-native-web",
			provider: "anthropic-api",
			scheduledTasks: 1,
		},
	],
	actual: [
		{
			organizationId: "org-a",
			planProjectionAtReportTime: "pro",
			targetKey: "chatgpt",
			provider: "olostep",
			startedAttempts: 3,
			missingCostAttempts: 0,
			actualMicrousd: 300,
		},
		{
			organizationId: "org-b",
			planProjectionAtReportTime: "basic",
			targetKey: "chatgpt",
			provider: "olostep",
			startedAttempts: 1,
			missingCostAttempts: 0,
			actualMicrousd: 100,
		},
		{
			organizationId: "org-c",
			planProjectionAtReportTime: "pro",
			targetKey: "claude-native-web",
			provider: "anthropic-api",
			startedAttempts: 1,
			missingCostAttempts: 1,
			actualMicrousd: 0,
		},
	],
};

describe("cloud provider spend reporting", () => {
	it("selects the previous complete UTC day", () => {
		expect({ day, periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString() }).toEqual({
			day: "2026-08-04",
			periodStart: "2026-08-04T00:00:00.000Z",
			periodEnd: "2026-08-05T00:00:00.000Z",
		});
	});

	it("uses a durable UTC schedule and a single daily singleton slot", () => {
		expect(CLOUD_PROVIDER_SPEND_REPORT_SCHEDULE).toMatchObject({
			cron: "15 1 * * *",
			key: "previous-complete-utc-day-v1",
			options: {
				tz: "UTC",
				singletonKey: "previous-complete-utc-day-v1",
				singletonSeconds: 86_400,
				singletonNextSlot: false,
			},
		});
	});

	it("compares scheduled-task forecast with every started attempt and groups current plan projections", () => {
		const report = buildCloudProviderSpendReport({
			day,
			periodStart,
			periodEnd,
			projectionAt,
			...rows,
			targets,
			estimates,
		});

		expect(report.planGrouping).toBe("current-projection-at-report-time");
		expect(report.totals).toEqual({
			organizations: 3,
			anomalousOrganizations: 2,
			scheduledTasks: 5,
			startedAttempts: 5,
			missingCostAttempts: 1,
			forecastMicrousd: 650,
			actualMicrousd: 400,
		});
		expect(report.organizations.find((row) => row.organizationId === "org-a")?.anomalyReasons).toEqual([
			"started-attempts-over-scheduled",
			"actual-estimate-over-forecast",
		]);
		expect(report.organizations.find((row) => row.organizationId === "org-b")?.anomalyReasons).toEqual([]);
		expect(report.organizations.find((row) => row.organizationId === "org-c")?.anomalyReasons).toEqual([
			"missing-cost",
		]);
		expect(report.providers).toEqual([
			{
				key: "olostep",
				scheduledTasks: 4,
				startedAttempts: 4,
				missingCostAttempts: 0,
				forecastMicrousd: 400,
				actualMicrousd: 400,
			},
			{
				key: "anthropic-api",
				scheduledTasks: 1,
				startedAttempts: 1,
				missingCostAttempts: 1,
				forecastMicrousd: 250,
				actualMicrousd: 0,
			},
		]);
		expect(report.plansAtReportTime).toEqual([
			{
				key: "pro",
				scheduledTasks: 3,
				startedAttempts: 4,
				missingCostAttempts: 1,
				forecastMicrousd: 450,
				actualMicrousd: 300,
			},
			{
				key: "basic",
				scheduledTasks: 2,
				startedAttempts: 1,
				missingCostAttempts: 0,
				forecastMicrousd: 200,
				actualMicrousd: 100,
			},
		]);
	});

	it("groups forecast under the immutable occurrence provider after a target remap", () => {
		const remappedTargets = [{ ...targets[0], provider: "brightdata" }, targets[1]];
		const report = buildCloudProviderSpendReport({
			day,
			periodStart,
			periodEnd,
			projectionAt,
			forecast: [rows.forecast[0]],
			actual: [],
			targets: remappedTargets,
			estimates,
		});

		expect(report.providers).toEqual([
			{
				key: "olostep",
				scheduledTasks: 2,
				startedAttempts: 0,
				missingCostAttempts: 0,
				forecastMicrousd: 200,
				actualMicrousd: 0,
			},
		]);
	});

	it("emits one summary, a complete per-org log stream, and only anomalous org alerts", async () => {
		const store: CloudProviderSpendStore = { loadRows: vi.fn().mockResolvedValue(rows) };
		const reporter: CloudProviderSpendReporter = {
			reportSummary: vi.fn(),
			reportOrganization: vi.fn(),
			reportAnomaly: vi.fn(),
		};

		await reportCloudProviderSpend({ now: projectionAt, targets, estimates, store, reporter });

		expect(store.loadRows).toHaveBeenCalledWith({ periodStart, periodEnd, projectionAt });
		expect(reporter.reportSummary).toHaveBeenCalledOnce();
		expect(reporter.reportOrganization).toHaveBeenCalledTimes(3);
		expect(reporter.reportAnomaly).toHaveBeenCalledTimes(2);
		expect(
			(reporter.reportAnomaly as ReturnType<typeof vi.fn>).mock.calls.map(([summary]) => summary.organizationId),
		).toEqual(["org-a", "org-c"]);
	});

	it("keeps a delayed durable job attributed to the day before its creation", async () => {
		const store: CloudProviderSpendStore = { loadRows: vi.fn().mockResolvedValue({ forecast: [], actual: [] }) };
		const reporter: CloudProviderSpendReporter = {
			reportSummary: vi.fn(),
			reportOrganization: vi.fn(),
			reportAnomaly: vi.fn(),
		};

		const report = await reportCloudProviderSpend({
			now: new Date("2026-08-07T10:00:00Z"),
			dayReference: new Date("2026-08-05T01:15:00Z"),
			targets,
			estimates,
			store,
			reporter,
		});

		expect(report.day).toBe("2026-08-04");
		expect(report.projectionAt.toISOString()).toBe("2026-08-07T10:00:00.000Z");
	});
});
