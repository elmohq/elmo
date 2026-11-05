import * as p from "@clack/prompts";
import {
	type AuditProgress,
	auditSites,
	type CheckGroup,
	type CheckResult,
	type CheckStatus,
	type HostResolution,
	type SiteAuditReport,
	type SiteReport,
} from "@workspace/site-audit";
import pc from "picocolors";

export interface AuditOptions {
	domain?: string[];
	pages?: string;
	delay?: string;
	maxRequests?: string;
	format?: string;
}

const GROUP_TITLES: Record<CheckGroup, string> = {
	reach: "Reach: Can Agents Get In?",
	read: "Read: Can Agents Read It?",
	understand: "Understand: Can Agents Make Sense of It?",
};

const STATUS_MARKS: Record<CheckStatus, string> = {
	pass: pc.green("✓"),
	warn: pc.yellow("!"),
	fail: pc.red("✗"),
	info: pc.blue("i"),
	not_checked: pc.dim("-"),
};

function positiveInt(value: string | undefined, flag: string): number | undefined {
	if (value === undefined) return undefined;
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${flag} must be a non-negative whole number.`);
	return parsed;
}

function renderCheck(check: CheckResult): string[] {
	const lines = [`  ${STATUS_MARKS[check.status]} ${pc.bold(check.title)}  ${pc.dim(check.evidence)}`];
	if (check.fix && check.status !== "pass") lines.push(`      ${pc.cyan("Fix:")} ${check.fix}`);
	for (const url of check.pages?.slice(0, 3) ?? []) lines.push(`      ${pc.dim(url)}`);
	if ((check.pages?.length ?? 0) > 3) lines.push(`      ${pc.dim(`…and ${(check.pages?.length ?? 0) - 3} more`)}`);
	return lines;
}

function renderHostProblems(hosts: HostResolution[]): string[] {
	return hosts.flatMap((host) => {
		if (host.outcome === "external")
			return [`${pc.yellow("!")} ${host.host} redirects off your domains, to ${host.finalOrigin}.`];
		if (host.outcome === "unreachable") return [`${pc.red("✗")} ${host.host} couldn't be reached: ${host.error}`];
		return [];
	});
}

function renderSite(site: SiteReport): string[] {
	const lines = ["", pc.bold(pc.underline(site.origin))];
	if (site.aliases.length > 0)
		lines.push(pc.dim(`Also reached from ${site.aliases.map((alias) => alias.host).join(", ")}`));
	lines.push(pc.dim(`Sampled ${site.pages.length} page(s)`));
	for (const group of Object.keys(GROUP_TITLES) as CheckGroup[]) {
		const checks = site.checks.filter((check) => check.group === group);
		if (checks.length > 0) lines.push("", pc.bold(GROUP_TITLES[group]), ...checks.flatMap(renderCheck));
	}
	const { pass, warn, fail, notChecked } = site.summary;
	const unchecked = notChecked ? pc.dim(`, ${notChecked} not checked`) : "";
	lines.push(
		"",
		`${pc.green(`${pass} passed`)}, ${pc.yellow(`${warn} warnings`)}, ${pc.red(`${fail} failed`)}${unchecked}`,
	);
	return lines;
}

export function renderReport(report: SiteAuditReport): string {
	const { used, limit, budgetExhausted } = report.requests;
	const budgetNote = budgetExhausted ? " (budget reached; raise --max-requests to check more)" : "";
	return [
		...renderHostProblems(report.hosts),
		...report.sites.flatMap(renderSite),
		pc.dim(`${used} of ${limit} requests used${budgetNote}.`),
	].join("\n");
}

export async function runAudit(url: string, options: AuditOptions): Promise<void> {
	const format = options.format ?? "text";
	if (format !== "text" && format !== "json") throw new Error("--format must be text or json.");
	const json = format === "json";

	const spinner = json || !process.stdout.isTTY ? undefined : p.spinner();
	spinner?.start(`Auditing ${url}`);
	const onProgress = (event: AuditProgress) => {
		if (event.type === "resolving") spinner?.message(`Resolving ${event.host}`);
		if (event.type === "auditing") spinner?.message(`Auditing ${event.origin}`);
		if (event.type === "fetch") spinner?.message(`${event.requestsUsed} requests: ${event.url}`);
	};

	const report = await auditSites({
		website: url,
		additionalDomains: options.domain,
		budget: {
			pages: positiveInt(options.pages, "--pages"),
			delayMs: positiveInt(options.delay, "--delay"),
			requests: positiveInt(options.maxRequests, "--max-requests"),
		},
		onProgress,
	});
	spinner?.stop(`Audited ${report.sites.map((site) => site.origin).join(", ") || url}`);

	console.log(json ? JSON.stringify(report, null, 2) : renderReport(report));

	const failed = report.sites.length === 0 || report.sites.some((site) => site.summary.fail > 0);
	if (failed) process.exitCode = 1;
}
