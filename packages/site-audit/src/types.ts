export const REPORT_SCHEMA_VERSION = 1;

export const DEFAULT_USER_AGENT = "ElmoBot/1.0 (+https://www.elmohq.com/docs/user-guide/agent-readiness-audit#elmobot)";

export type CheckStatus = "pass" | "warn" | "fail" | "info" | "not_checked";

export type CheckGroup = "reach" | "read" | "understand";

export interface CheckResult {
	id: string;
	group: CheckGroup;
	title: string;
	status: CheckStatus;
	evidence: string;
	/** Present when the check warned or failed, or (`info`) suggests an optional improvement. */
	fix?: string;
	pages?: string[];
}

export type HostOutcome = "site" | "alias" | "external" | "unreachable";

export interface RedirectHop {
	url: string;
	status: number;
	location?: string;
}

export interface HostResolution {
	/** Lowercased, without a leading `www.`. */
	host: string;
	outcome: HostOutcome;
	finalOrigin?: string;
	hops: RedirectHop[];
	error?: string;
}

export interface SiteReport {
	origin: string;
	aliases: HostResolution[];
	pages: string[];
	checks: CheckResult[];
	summary: { pass: number; warn: number; fail: number; notChecked: number };
	/** The site refused the audit (robots.txt or repeated errors), so its unchecked results count as failures. */
	blockedAudit: boolean;
	/** 0–100: a pass counts fully, a warning half, a failure nothing. Optional (`info`) results don't count, nor do unchecked ones unless the site blocked the audit. Null when nothing was scored. */
	score: number | null;
}

export interface SiteAuditReport {
	schemaVersion: typeof REPORT_SCHEMA_VERSION;
	auditedAt: string;
	userAgent: string;
	hosts: HostResolution[];
	sites: SiteReport[];
	score: number | null;
	requests: { used: number; limit: number; budgetExhausted: boolean };
}

export interface AuditBudget {
	/** Total HTTP requests across every host. */
	requests?: number;
	/** Pages sampled per site, including the homepage. */
	pages?: number;
	/** Minimum gap between requests to the same host. */
	delayMs?: number;
}

export type AuditProgress =
	| { type: "resolving"; host: string }
	| { type: "auditing"; origin: string }
	| { type: "fetch"; url: string; requestsUsed: number };

export interface AuditOptions {
	website: string;
	additionalDomains?: string[];
	/** Pages to audit before sampling the sitemap, e.g. URLs AI engines cite. */
	extraPages?: string[];
	budget?: AuditBudget;
	userAgent?: string;
	signal?: AbortSignal;
	onProgress?: (event: AuditProgress) => void;
	/** Lets tests reach a local server. Never set this for user-supplied hosts. */
	allowPrivateNetwork?: boolean;
}
