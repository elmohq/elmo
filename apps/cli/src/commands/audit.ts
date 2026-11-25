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
	failUnder?: string;
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

function wholeNumber(value: string | undefined, flag: string, min: number): number | undefined {
	if (value === undefined) return undefined;
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < min) throw new Error(`${flag} must be a whole number of at least ${min}.`);
	return parsed;
}

function plural(n: number, noun: string): string {
	return `${n} ${n === 1 ? noun : `${noun}s`}`;
}

// Evidence, URLs, and errors come from the audited site, so control characters are dropped before
// printing: an escape sequence in a robots.txt could otherwise rewrite the terminal or its clipboard.
function isControl(character: string): boolean {
	const code = character.codePointAt(0) ?? 0;
	return code < 0x20 || (code >= 0x7f && code <= 0x9f);
}

function inert(text: string | undefined): string {
	return [...(text ?? "")]
		.map((character) => (isControl(character) ? (character === "\n" ? " " : "") : character))
		.join("");
}

function renderCheck(check: CheckResult): string[] {
	const lines = [`  ${STATUS_MARKS[check.status]} ${pc.bold(check.title)}  ${pc.dim(inert(check.evidence))}`];
	if (check.fix) lines.push(`      ${pc.cyan("Fix:")} ${check.fix}`);
	for (const url of check.pages?.slice(0, 3) ?? []) lines.push(`      ${pc.dim(inert(url))}`);
	if ((check.pages?.length ?? 0) > 3) lines.push(`      ${pc.dim(`…and ${(check.pages?.length ?? 0) - 3} more`)}`);
	return lines;
}

function renderHostProblems(hosts: HostResolution[]): string[] {
	return hosts.flatMap((host) => {
		if (host.outcome === "external")
			return [`${pc.yellow("!")} ${inert(host.host)} redirects off your domains, to ${inert(host.finalOrigin)}.`];
		if (host.outcome === "unreachable")
			return [`${pc.red("✗")} ${inert(host.host)} couldn't be reached: ${inert(host.error)}`];
		return [];
	});
}

function renderSite(site: SiteReport): string[] {
	const lines = ["", pc.bold(pc.underline(inert(site.origin)))];
	if (site.aliases.length > 0)
		lines.push(pc.dim(`Also reached from ${site.aliases.map((alias) => inert(alias.host)).join(", ")}`));
	lines.push(pc.dim(`Sampled ${plural(site.pages.length, "page")}`));
	for (const group of Object.keys(GROUP_TITLES) as CheckGroup[]) {
		const checks = site.checks.filter((check) => check.group === group);
		if (checks.length > 0) lines.push("", pc.bold(GROUP_TITLES[group]), ...checks.flatMap(renderCheck));
	}
	const { pass, warn, fail, notChecked } = site.summary;
	const unchecked = notChecked ? pc.dim(`, ${notChecked} not checked`) : "";
	lines.push("");
	if (site.blockedAudit) lines.push(pc.yellow("The site blocked the audit, so unchecked items count as failures."));
	if (site.score !== null) lines.push(pc.bold(`Score: ${site.score}/100`));
	lines.push(
		`${pc.green(`${pass} passed`)}, ${pc.yellow(plural(warn, "warning"))}, ${pc.red(`${fail} failed`)}${unchecked}`,
	);
	return lines;
}

export function renderReport(report: SiteAuditReport): string {
	const { used, limit, budgetExhausted } = report.requests;
	const budgetNote = budgetExhausted ? " (budget reached; raise --max-requests to check more)" : "";
	return [
		...renderHostProblems(report.hosts),
		...report.sites.flatMap(renderSite),
		...(report.sites.length > 1 && report.score !== null ? ["", pc.bold(`Overall score: ${report.score}/100`)] : []),
		pc.dim(`${used} of ${limit} requests used${budgetNote}.`),
	].join("\n");
}

export async function runAudit(url: string, options: AuditOptions): Promise<void> {
	const format = options.format ?? "text";
	if (format !== "text" && format !== "json") throw new Error("--format must be text or json.");
	const json = format === "json";
	const budget = {
		pages: wholeNumber(options.pages, "--pages", 1),
		delayMs: wholeNumber(options.delay, "--delay", 0),
		requests: wholeNumber(options.maxRequests, "--max-requests", 1),
	};
	const failUnder = wholeNumber(options.failUnder, "--fail-under", 0);

	const spinner = json || !process.stdout.isTTY ? undefined : p.spinner();
	spinner?.start(`Auditing ${url}`);
	const onProgress = (event: AuditProgress) => {
		if (event.type === "resolving") spinner?.message(`Resolving ${inert(event.host)}`);
		if (event.type === "auditing") spinner?.message(`Auditing ${inert(event.origin)}`);
		if (event.type === "fetch") spinner?.message(`${event.requestsUsed} requests: ${inert(event.url)}`);
	};

	let report: SiteAuditReport;
	try {
		report = await auditSites({ website: url, additionalDomains: options.domain, budget, onProgress });
	} finally {
		spinner?.stop(`Audited ${url}`);
	}

	console.log(json ? JSON.stringify(report, null, 2) : renderReport(report));

	const belowThreshold = failUnder !== undefined && (report.score ?? 0) < failUnder;
	if (report.sites.length === 0 || belowThreshold) process.exitCode = 1;
}
