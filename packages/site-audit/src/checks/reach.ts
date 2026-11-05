import { AI_SEARCH_CRAWLERS, AI_TRAINING_CRAWLERS, AI_USER_AGENTS } from "../bots";
import { contentType, isHtmlResponse, isOk, isResponse, type SiteArtifacts } from "../gather";
import type { CheckResult, HostResolution } from "../types";
import { type CheckDefinition, list, notFetched, result, wasNotFetched } from "./result";

const define = (id: string, title: string, fix: string): CheckDefinition => ({ id, group: "reach", title, fix });

const ROBOTS_VALID = define(
	"robots-valid",
	"robots.txt",
	"Serve a plain-text /robots.txt (RFC 9309) with at least one User-agent group and a Sitemap line.",
);
const ROBOTS_AI_SEARCH = define(
	"robots-ai-search",
	"AI Search Crawlers Allowed",
	"Allow OAI-SearchBot, Claude-SearchBot, and PerplexityBot in robots.txt, so AI search engines can index and cite your pages.",
);
const ROBOTS_AI_USER = define(
	"robots-ai-user",
	"AI User Agents Allowed",
	"Allow ChatGPT-User, Claude-User, and Perplexity-User in robots.txt. They fetch a page because a person asked an assistant about it.",
);
const ROBOTS_AI_TRAINING = define(
	"robots-ai-training",
	"AI Training Crawlers",
	"Decide deliberately whether GPTBot, ClaudeBot, Google-Extended, and CCBot may use your content for training, and say so in robots.txt.",
);
const CONTENT_SIGNALS = define(
	"content-signals",
	"Content Signals",
	"Add a Content-Signal line to robots.txt (for example `Content-Signal: search=yes, ai-input=yes, ai-train=no`) to state how AI systems may use your content.",
);
const BOT_REACHABILITY = define(
	"bot-reachability",
	"Reachable by AI Agents",
	"Make sure bot protection (a WAF, bot-fight mode, or a CDN challenge) lets AI crawlers and user agents through. Verified bots can be allowlisted by IP or signature.",
);
const NOINDEX = define(
	"noindex",
	"Pages Not Hidden From Search",
	"Remove `noindex` from the robots meta tag and X-Robots-Tag header on pages you want AI search to use.",
);
const CONTENT_PUBLIC = define(
	"content-public",
	"Content Without Signing In",
	"Keep marketing, docs, and pricing pages readable without an account. Agents can't sign in.",
);
const REDIRECT_HYGIENE = define(
	"redirect-hygiene",
	"Clean Redirects",
	"Use server-side 301/308 redirects with at most two hops instead of meta-refresh or JavaScript redirects.",
);
const ALTERNATE_DOMAINS = define(
	"alternate-domains",
	"Alternate Domains Redirect Cleanly",
	"Redirect each alternate domain to the primary site in a single permanent (301 or 308) HTTPS redirect.",
);
const NOT_FOUND = define(
	"not-found",
	"Real 404 Pages",
	'Return HTTP 404 for pages that don\'t exist. A 200 "soft 404" makes agents treat an error page as content.',
);

function robotsCheck(site: SiteArtifacts): CheckResult {
	const fetched = site.robotsFetch;
	if (wasNotFetched(fetched)) return notFetched(ROBOTS_VALID, fetched, "robots.txt");
	if (!isResponse(fetched)) return result(ROBOTS_VALID, "fail", `robots.txt couldn't be fetched: ${fetched.message}.`);
	if (fetched.status === 404) return result(ROBOTS_VALID, "fail", "There is no robots.txt (HTTP 404).");
	if (fetched.status < 200 || fetched.status >= 300) {
		return result(ROBOTS_VALID, "fail", `robots.txt returned HTTP ${fetched.status}.`);
	}
	if (isHtmlResponse(fetched))
		return result(ROBOTS_VALID, "fail", "robots.txt returns an HTML page instead of plain text.");
	if (!site.robots || site.robots.userAgents.length === 0) {
		return result(ROBOTS_VALID, "warn", "robots.txt has no User-agent groups.");
	}
	const sitemapNote = site.robots.sitemaps.length > 0 ? "" : " It doesn't declare a Sitemap.";
	return result(
		ROBOTS_VALID,
		sitemapNote ? "warn" : "pass",
		`robots.txt has ${site.robots.userAgents.length} User-agent group(s).${sitemapNote}`,
	);
}

function botRules(
	site: SiteArtifacts,
	definition: CheckDefinition,
	bots: string[],
	informational = false,
): CheckResult {
	if (!site.robots) {
		if (wasNotFetched(site.robotsFetch)) return notFetched(definition, site.robotsFetch, "robots.txt");
		return result(definition, informational ? "info" : "pass", `No robots.txt rules, so nothing blocks ${list(bots)}.`);
	}
	const robots = site.robots;
	const urls = site.pages.map((page) => page.url);
	const blocked = bots
		.map((bot) => ({ bot, pages: urls.filter((url) => robots.isAllowed(url, bot) === false) }))
		.filter((entry) => entry.pages.length > 0);
	if (blocked.length === 0) {
		return result(
			definition,
			informational ? "info" : "pass",
			`${list(bots)} are allowed on all ${urls.length} sampled pages.`,
		);
	}
	const evidence = blocked
		.map(({ bot, pages }) => `${bot} is blocked on ${pages.length} of ${urls.length} pages`)
		.join("; ");
	return result(definition, informational ? "info" : "fail", `${evidence}.`, [
		...new Set(blocked.flatMap((entry) => entry.pages)),
	]);
}

function contentSignals(site: SiteArtifacts): CheckResult {
	if (!site.robots)
		return result(CONTENT_SIGNALS, "warn", "No robots.txt, so there's nowhere to declare Content Signals.");
	const signals = site.robots.contentSignals;
	if (signals.length === 0) return result(CONTENT_SIGNALS, "warn", "robots.txt has no Content-Signal declaration.");
	return result(CONTENT_SIGNALS, "pass", `Content-Signal: ${signals[0]}.`);
}

const CHALLENGE = /just a moment|attention required|access denied|verify you are human|captcha|are you a robot/i;

function botReachability(site: SiteArtifacts): CheckResult {
	const baseline = site.pages[0]?.html;
	const baselineLength = isOk(baseline) ? baseline.body.length : 0;
	const outcomes = site.botProbes.map(({ bot, fetched }) => {
		if (fetched.kind === "skipped") return { bot: bot.token, state: "unchecked" as const };
		if (fetched.kind === "error") return { bot: bot.token, state: "blocked" as const, detail: fetched.message };
		const challenged =
			!isOk(fetched) ||
			fetched.headers["cf-mitigated"] === "challenge" ||
			(CHALLENGE.test(fetched.body.slice(0, 5000)) && fetched.body.length < baselineLength / 2);
		return challenged
			? { bot: bot.token, state: "blocked" as const, detail: `HTTP ${fetched.status}` }
			: { bot: bot.token, state: "reachable" as const };
	});
	const checked = outcomes.filter((outcome) => outcome.state !== "unchecked");
	if (checked.length === 0) return notFetched(BOT_REACHABILITY, site.botProbes[0]?.fetched, "bot reachability");
	const blocked = checked.filter((outcome) => outcome.state === "blocked");
	const note =
		" Sent with each bot's user agent from Elmo's address, so sites that verify bots by IP may treat the real bots differently.";
	if (blocked.length === 0) {
		return result(BOT_REACHABILITY, "pass", `The homepage loads for ${list(checked.map((o) => o.bot))}.${note}`);
	}
	const detail = blocked.map((o) => `${o.bot} (${"detail" in o ? o.detail : "blocked"})`);
	return result(
		BOT_REACHABILITY,
		blocked.length === checked.length ? "fail" : "warn",
		`Blocked or challenged: ${list(detail)}.${note}`,
	);
}

function noindex(site: SiteArtifacts): CheckResult {
	const hidden = site.pages.filter((page) => {
		const header = isResponse(page.html) ? (page.html.headers["x-robots-tag"] ?? "") : "";
		return /noindex/i.test(header) || /noindex/.test(page.parsed?.robotsMeta ?? "");
	});
	const checked = site.pages.filter((page) => isResponse(page.html));
	if (checked.length === 0) return notFetched(NOINDEX, site.pages[0]?.html, "the sampled pages");
	if (hidden.length === 0)
		return result(NOINDEX, "pass", `None of the ${checked.length} sampled pages is marked noindex.`);
	const homeHidden = hidden.some((page) => page === site.pages[0]);
	return result(
		NOINDEX,
		homeHidden ? "fail" : "warn",
		`${hidden.length} of ${checked.length} sampled pages are marked noindex.`,
		hidden.map((page) => page.url),
	);
}

const LOGIN_PATH = /\/(login|log-in|signin|sign-in|auth|sso|account\/login)(\/|$|\?)/i;

function contentPublic(site: SiteArtifacts): CheckResult {
	const checked = site.pages.filter((page) => isResponse(page.html));
	if (checked.length === 0) return notFetched(CONTENT_PUBLIC, site.pages[0]?.html, "the sampled pages");
	const gated = checked.filter((page) => {
		const html = page.html;
		return (
			isResponse(html) && (html.status === 401 || html.status === 403 || LOGIN_PATH.test(new URL(html.url).pathname))
		);
	});
	if (gated.length === 0)
		return result(CONTENT_PUBLIC, "pass", `All ${checked.length} sampled pages are publicly readable.`);
	return result(
		CONTENT_PUBLIC,
		gated.length === checked.length ? "fail" : "warn",
		`${gated.length} of ${checked.length} sampled pages require signing in.`,
		gated.map((page) => page.url),
	);
}

function redirectHygiene(site: SiteArtifacts): CheckResult {
	const checked = site.pages.filter((page) => isResponse(page.html));
	if (checked.length === 0) return notFetched(REDIRECT_HYGIENE, site.pages[0]?.html, "the sampled pages");
	const stubs = checked.filter((page) => page.parsed?.metaRefresh || page.parsed?.jsRedirectStub);
	const longChains = checked.filter((page) => isResponse(page.html) && page.html.hops.length > 2);
	if (stubs.length > 0) {
		return result(
			REDIRECT_HYGIENE,
			"fail",
			`${stubs.length} page(s) redirect with meta-refresh or JavaScript, which many agents don't follow.`,
			stubs.map((page) => page.url),
		);
	}
	if (longChains.length > 0) {
		return result(
			REDIRECT_HYGIENE,
			"warn",
			`${longChains.length} page(s) take more than two redirects to load.`,
			longChains.map((page) => page.url),
		);
	}
	return result(
		REDIRECT_HYGIENE,
		"pass",
		`No meta-refresh, JavaScript redirects, or long chains across ${checked.length} pages.`,
	);
}

export function alternateDomains(aliases: HostResolution[]): CheckResult | undefined {
	if (aliases.length === 0) return undefined;
	const problems = aliases.flatMap((alias) => {
		const statuses = alias.hops.map((hop) => hop.status);
		const issues: string[] = [];
		if (alias.hops.length > 1) issues.push(`${alias.hops.length} hops`);
		if (statuses.some((status) => status === 302 || status === 307)) issues.push("a temporary redirect");
		if (!alias.finalOrigin?.startsWith("https:")) issues.push("it ends on HTTP");
		return issues.length > 0 ? [`${alias.host} (${list(issues)})`] : [];
	});
	if (problems.length === 0) {
		return result(
			ALTERNATE_DOMAINS,
			"pass",
			`${list(aliases.map((alias) => alias.host))} redirect${aliases.length === 1 ? "s" : ""} here in one permanent hop.`,
		);
	}
	return result(ALTERNATE_DOMAINS, "warn", `Redirect issues: ${list(problems)}.`);
}

function notFound(site: SiteArtifacts): CheckResult {
	const fetched = site.notFound;
	if (!isResponse(fetched)) return notFetched(NOT_FOUND, fetched, "a missing page");
	if (fetched.status === 404 || fetched.status === 410) {
		const agentFriendly = /markdown|text\/plain/.test(contentType(fetched));
		return result(
			NOT_FOUND,
			"pass",
			`A missing page returns HTTP ${fetched.status}${agentFriendly ? " with a plain-text or markdown body" : ""}.`,
		);
	}
	if (fetched.status >= 200 && fetched.status < 300) {
		return result(NOT_FOUND, "fail", `A missing page returns HTTP ${fetched.status} (a soft 404).`);
	}
	return result(NOT_FOUND, "warn", `A missing page returns HTTP ${fetched.status} instead of 404.`);
}

export function reachChecks(site: SiteArtifacts, aliases: HostResolution[]): CheckResult[] {
	return [
		robotsCheck(site),
		botRules(site, ROBOTS_AI_SEARCH, AI_SEARCH_CRAWLERS),
		botRules(site, ROBOTS_AI_USER, AI_USER_AGENTS),
		botRules(site, ROBOTS_AI_TRAINING, AI_TRAINING_CRAWLERS, true),
		contentSignals(site),
		botReachability(site),
		noindex(site),
		contentPublic(site),
		redirectHygiene(site),
		alternateDomains(aliases),
		notFound(site),
	].filter((check): check is CheckResult => check !== undefined);
}
