import { reachChecks } from "./checks/reach";
import { readChecks } from "./checks/read";
import { understandChecks } from "./checks/understand";
import { Fetcher } from "./fetcher";
import { gatherSite } from "./gather";
import { normalizeHost } from "./hosts";
import { resolveHosts } from "./resolve";
import {
	type AuditOptions,
	type CheckResult,
	DEFAULT_USER_AGENT,
	REPORT_SCHEMA_VERSION,
	type SiteAuditReport,
	type SiteReport,
} from "./types";

const DEFAULT_REQUESTS = 75;
const DEFAULT_PAGES = 10;
const DEFAULT_DELAY_MS = 1000;

function summarize(checks: CheckResult[]): SiteReport["summary"] {
	return {
		pass: checks.filter((check) => check.status === "pass").length,
		warn: checks.filter((check) => check.status === "warn").length,
		fail: checks.filter((check) => check.status === "fail").length,
		notChecked: checks.filter((check) => check.status === "not_checked").length,
	};
}

function scoreChecks(checks: CheckResult[], blockedAudit: boolean): number | null {
	const scored = checks.filter(
		(check) =>
			check.status === "pass" ||
			check.status === "warn" ||
			check.status === "fail" ||
			(blockedAudit && check.status === "not_checked"),
	);
	if (scored.length === 0) return null;
	const earned = scored.reduce(
		(sum, check) => sum + (check.status === "pass" ? 1 : check.status === "warn" ? 0.5 : 0),
		0,
	);
	return Math.round((earned / scored.length) * 100);
}

function meanScore(sites: SiteReport[]): number | null {
	const scores = sites.map((site) => site.score).filter((score): score is number => score !== null);
	return scores.length === 0 ? null : Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

export async function auditSites(options: AuditOptions): Promise<SiteAuditReport> {
	const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
	const fetcher = new Fetcher({
		requestLimit: options.budget?.requests ?? DEFAULT_REQUESTS,
		delayMs: options.budget?.delayMs ?? DEFAULT_DELAY_MS,
		userAgent,
		signal: options.signal,
		onProgress: options.onProgress,
		allowPrivateNetwork: options.allowPrivateNetwork,
	});

	const byHost = new Map<string, string>();
	// Only HTTPS is fetched, so an http:// address is audited as its HTTPS site.
	const upgrade = (host: string) =>
		options.allowPrivateNetwork ? host : host.trim().replace(/^http:\/\//i, "https://");
	for (const host of [options.website, ...(options.additionalDomains ?? [])].map(upgrade)) {
		if (!byHost.has(normalizeHost(host))) byHost.set(normalizeHost(host), host);
	}
	const inputs = [...byHost.values()];
	for (const host of inputs) options.onProgress?.({ type: "resolving", host });
	const resolved = await resolveHosts(fetcher, inputs);

	const siteOrigins = [
		...new Set(
			resolved
				.filter((host) => host.outcome === "site" || host.outcome === "alias")
				.map((host) => host.finalOrigin as string),
		),
	];

	const sites: SiteReport[] = [];
	for (const origin of siteOrigins) {
		options.onProgress?.({ type: "auditing", origin });
		const aliases = resolved.filter((host) => host.outcome === "alias" && host.finalOrigin === origin);
		const homepage = resolved.find((host) => host.finalOrigin === origin && host.homepage)?.homepage;
		const artifacts = await gatherSite({
			fetcher,
			origin,
			homepage,
			priorityPages: options.extraPages ?? [],
			pageLimit: options.budget?.pages ?? DEFAULT_PAGES,
			userAgentToken: fetcher.robotsToken,
		});
		const checks = [...reachChecks(artifacts, aliases), ...readChecks(artifacts), ...understandChecks(artifacts)];
		const blockedAudit =
			fetcher.stopped(artifacts.origin) ||
			artifacts.robots?.isAllowed(`${artifacts.origin}/`, fetcher.robotsToken) === false;
		sites.push({
			origin: artifacts.origin,
			aliases: aliases.map(({ homepage: _homepage, ...alias }) => alias),
			pages: artifacts.pages.map((page) => page.url),
			checks,
			summary: summarize(checks),
			blockedAudit,
			score: scoreChecks(checks, blockedAudit),
		});
	}

	return {
		schemaVersion: REPORT_SCHEMA_VERSION,
		auditedAt: new Date().toISOString(),
		userAgent,
		hosts: resolved.map(({ homepage: _homepage, ...host }) => host),
		sites,
		score: meanScore(sites),
		requests: { used: fetcher.used, limit: fetcher.limit, budgetExhausted: fetcher.budgetExhausted },
	};
}
