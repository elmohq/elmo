export const REPORT_SCHEMA_VERSION = 1;

export const DEFAULT_USER_AGENT = "ElmoBot/1.0 (+https://www.elmohq.com/docs/user-guide/agent-readiness-audit#elmobot)";

export type CheckStatus = "pass" | "warn" | "fail" | "info" | "not_checked";

export type CheckGroup = "reach" | "read" | "understand";

export interface CheckResult {
	id: string;
	group: CheckGroup;
	title: string;
	status: CheckStatus;
	/** What was observed, in one or two sentences. */
	evidence: string;
	/** How to fix it. Present on anything that didn't pass. */
	fix?: string;
	/** Pages the finding applies to, when it is page-scoped. */
	pages?: string[];
}

export type HostOutcome = "site" | "alias" | "external" | "unreachable";

export interface RedirectHop {
	url: string;
	status: number;
	location?: string;
}

export interface HostResolution {
	/** The host as given, normalized. */
	host: string;
	outcome: HostOutcome;
	/** Where the host's homepage finally lands; absent when unreachable. */
	finalOrigin?: string;
	hops: RedirectHop[];
	error?: string;
}

export interface SiteReport {
	origin: string;
	/** Hosts that redirect to this site, with how they get there. */
	aliases: HostResolution[];
	pages: string[];
	checks: CheckResult[];
	summary: { pass: number; warn: number; fail: number; notChecked: number };
}

export interface SiteAuditReport {
	schemaVersion: typeof REPORT_SCHEMA_VERSION;
	auditedAt: string;
	userAgent: string;
	hosts: HostResolution[];
	sites: SiteReport[];
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
