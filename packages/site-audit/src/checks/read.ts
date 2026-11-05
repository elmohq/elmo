import type { Fetched } from "../fetcher";
import {
	contentType,
	isHtmlResponse,
	isOk,
	isResponse,
	type PageArtifacts,
	parsedPages,
	type SiteArtifacts,
} from "../gather";
import { codeFencesBalanced, estimateTokens, hasFrontmatter, llmsTxtShape, looksLikeHtml } from "../parse/markdown";
import type { CheckResult } from "../types";
import { type CheckDefinition, count, notFetched, result, share, wasNotFetched } from "./result";

const define = (id: string, title: string, fix: string): CheckDefinition => ({ id, group: "read", title, fix });

const CONTENT_NO_JS = define(
	"content-no-js",
	"Content Without JavaScript",
	"Server-render your main content. Most AI crawlers don't run JavaScript, so a client-rendered shell reads as an empty page.",
);
const TOKEN_BUDGET = define(
	"page-token-budget",
	"Page Size for Agents",
	"Keep each page's main content to about 30k tokens, splitting very long pages, so it fits in an agent's context alongside the question.",
);
const MARKDOWN_ACCEPT = define(
	"markdown-accept",
	"Markdown via Accept Header",
	"Return a markdown version of each page when a request sends `Accept: text/markdown`, with `Vary: Accept` so caches keep the two apart.",
);
const MARKDOWN_SUFFIX = define(
	"markdown-suffix",
	"Markdown at .md URLs",
	"Serve each page's markdown at the same path with `.md` appended (and `/index.md` for the homepage).",
);
const MARKDOWN_ALTERNATE = define(
	"markdown-alternate",
	"Markdown Alternate Link",
	'Advertise each page\'s markdown with `<link rel="alternate" type="text/markdown" href="…">` in the HTML head.',
);
const MARKDOWN_BOT_UA = define(
	"markdown-bot-ua",
	"Markdown for AI User Agents",
	"Optionally serve markdown to known AI user agents (ChatGPT-User, Claude-User) even when they ask for HTML.",
);
const MARKDOWN_QUALITY = define(
	"markdown-quality",
	"Markdown Quality",
	"Start markdown documents with a `---` frontmatter block (title, description, canonical URL, last updated) and close every code fence.",
);
const LLMS_TXT = define(
	"llms-txt",
	"llms.txt",
	"Publish /llms.txt as described at llmstxt.org: an H1 with the site name, a `>` summary, and sections of annotated markdown links.",
);
const LLMS_TXT_LINKS = define(
	"llms-txt-links",
	"llms.txt Links Resolve",
	"Fix or remove llms.txt links that don't resolve. Prefer links to markdown versions of pages.",
);
const LLMS_FULL_TXT = define(
	"llms-full-txt",
	"llms-full.txt",
	"Publish /llms-full.txt with the full text of your key pages or docs in one markdown file.",
);
const LLMS_TXT_SECTIONS = define(
	"llms-txt-sections",
	"Docs Section llms.txt",
	"For a large docs section, publish its own llms.txt (for example /docs/llms.txt), so agents can load just that area.",
);
const SITEMAP = define(
	"sitemap",
	"Sitemap",
	"Publish an XML sitemap listing your canonical pages, and reference it from robots.txt with a Sitemap line.",
);
const SITEMAP_LASTMOD = define(
	"sitemap-lastmod",
	"Sitemap Freshness Dates",
	"Give every sitemap entry an accurate `<lastmod>`, so crawlers can find new and updated pages first.",
);
const LINK_HEADERS = define(
	"link-headers",
	"Discovery Link Headers",
	'Add an HTTP Link header (RFC 8288) to the homepage pointing at your sitemap, llms.txt (`rel="describedby"`), and markdown alternate.',
);
const AGENT_VIEW = define(
	"agent-view",
	"Agent View",
	"Optionally serve a leaner agent-oriented view of the homepage (for example at `?mode=agent`), without navigation and marketing chrome.",
);

// Well under the homepage's size means a deliberately trimmed view, not the same page with a little dynamic noise.
const LEANER_VIEW = 0.7;
const MIN_TEXT = 500;
const THIN_TEXT = 100;
const TOKEN_LIMIT = 30_000;
const TOKEN_HARD_LIMIT = 100_000;

function contentNoJs(site: SiteArtifacts): CheckResult {
	const pages = parsedPages(site);
	if (pages.length === 0) return notFetched(CONTENT_NO_JS, site.pages[0]?.html, "page content");
	const thin = pages.filter((page) => (page.parsed?.text.length ?? 0) < MIN_TEXT || page.parsed?.headings.length === 0);
	const empty = pages.filter((page) => (page.parsed?.text.length ?? 0) < THIN_TEXT);
	const home = site.pages[0]?.parsed;
	const homeSummary = home
		? `Homepage: ${home.text.length.toLocaleString("en-US")} characters of text and ${count(home.headings.length, "heading")} in the server HTML. `
		: "";
	if (thin.length === 0)
		return result(
			CONTENT_NO_JS,
			"pass",
			`${homeSummary}All ${pages.length} sampled pages have text without JavaScript.`,
		);
	return result(
		CONTENT_NO_JS,
		empty.length > 0 ? "fail" : "warn",
		`${homeSummary}${thin.length} of ${pages.length} pages have little or no text or headings without JavaScript.`,
		thin.map((page) => page.url),
	);
}

function markdownBody(fetched: Fetched | undefined): string | undefined {
	if (!isOk(fetched) || isHtmlResponse(fetched)) return undefined;
	return /markdown|text\/plain/.test(contentType(fetched)) ? fetched.body : undefined;
}

function tokenBudget(site: SiteArtifacts): CheckResult {
	const pages = parsedPages(site);
	if (pages.length === 0) return notFetched(TOKEN_BUDGET, site.pages[0]?.html, "page size");
	const sizes = pages.map((page) => ({
		url: page.url,
		tokens: estimateTokens(
			markdownBody(page.markdownAccept) ?? markdownBody(page.markdownSuffix) ?? page.parsed?.text ?? "",
		),
	}));
	const largest = Math.max(...sizes.map((size) => size.tokens));
	const over = sizes.filter((size) => size.tokens > TOKEN_LIMIT);
	const evidence = `The largest sampled page is about ${largest.toLocaleString("en-US")} tokens.`;
	if (over.length === 0) return result(TOKEN_BUDGET, "pass", evidence);
	return result(
		TOKEN_BUDGET,
		largest > TOKEN_HARD_LIMIT ? "fail" : "warn",
		`${evidence} Over about ${TOKEN_LIMIT.toLocaleString("en-US")} tokens: ${count(over.length, "page")}.`,
		over.map((size) => size.url),
	);
}

function perPageMarkdown(
	site: SiteArtifacts,
	definition: CheckDefinition,
	pick: (page: PageArtifacts) => Fetched | undefined,
	what: string,
	requireVary = false,
): CheckResult {
	const attempted = site.pages.filter((page) => !wasNotFetched(pick(page)));
	if (attempted.length === 0) return notFetched(definition, pick(site.pages[0] as PageArtifacts), what);
	const serving = attempted.filter((page) => markdownBody(pick(page)) !== undefined);
	const missingVary = serving.filter((page) => {
		const fetched = pick(page);
		return requireVary && isResponse(fetched) && !/accept/i.test(fetched.headers.vary ?? "");
	});
	if (serving.length === 0)
		return result(definition, "fail", `No sampled page serves ${what} (${count(attempted.length, "page")} checked).`);
	if (missingVary.length > 0) {
		return result(
			definition,
			"warn",
			`${serving.length} of ${attempted.length} pages serve ${what}, but ${missingVary.length} omit \`Vary: Accept\`.`,
			missingVary.map((page) => page.url),
		);
	}
	const missing = attempted.filter((page) => !serving.includes(page));
	return result(
		definition,
		missing.length === 0 ? "pass" : "warn",
		`${serving.length} of ${attempted.length} sampled pages serve ${what}.`,
		missing.map((page) => page.url),
	);
}

function markdownAlternate(site: SiteArtifacts): CheckResult {
	const pages = parsedPages(site);
	if (pages.length === 0) return notFetched(MARKDOWN_ALTERNATE, site.pages[0]?.html, "page markup");
	const advertising = pages.filter((page) => (page.parsed?.markdownAlternates.length ?? 0) > 0);
	if (advertising.length === 0) return result(MARKDOWN_ALTERNATE, "info", "No page advertises a markdown alternate.");
	return result(
		MARKDOWN_ALTERNATE,
		advertising.length === pages.length ? "pass" : "warn",
		`${advertising.length} of ${pages.length} sampled pages advertise a markdown alternate.`,
		pages.filter((page) => !advertising.includes(page)).map((page) => page.url),
	);
}

function markdownForBots(site: SiteArtifacts): CheckResult {
	const userAgents = site.botProbes.filter((probe) => probe.bot.token.endsWith("-User"));
	const checked = userAgents.filter((probe) => isResponse(probe.fetched));
	if (checked.length === 0) return notFetched(MARKDOWN_BOT_UA, userAgents[0]?.fetched, "bot user agents");
	const served = checked.filter((probe) => markdownBody(probe.fetched) !== undefined);
	if (served.length === 0) return result(MARKDOWN_BOT_UA, "info", "AI user agents asking for HTML get HTML.");
	return result(MARKDOWN_BOT_UA, "pass", `${served.map((probe) => probe.bot.token).join(", ")} get markdown.`);
}

function markdownQuality(site: SiteArtifacts): CheckResult {
	const documents = site.pages.flatMap((page) =>
		[page.markdownAccept, page.markdownSuffix]
			.map((fetched) => ({ url: isResponse(fetched) ? fetched.url : page.url, body: markdownBody(fetched) }))
			.filter((doc): doc is { url: string; body: string } => doc.body !== undefined),
	);
	const unique = [...new Map(documents.map((doc) => [doc.url, doc])).values()];
	if (unique.length === 0)
		return result(MARKDOWN_QUALITY, "not_checked", "No markdown documents were served to check.");
	const unbalanced = unique.filter((doc) => !codeFencesBalanced(doc.body));
	const noFrontmatter = unique.filter((doc) => !hasFrontmatter(doc.body));
	if (unbalanced.length > 0) {
		return result(
			MARKDOWN_QUALITY,
			"fail",
			`Unclosed code fence in ${count(unbalanced.length, "markdown document")}.`,
			unbalanced.map((doc) => doc.url),
		);
	}
	if (noFrontmatter.length > 0) {
		return result(
			MARKDOWN_QUALITY,
			"warn",
			`${noFrontmatter.length} of ${unique.length} markdown documents have no frontmatter.`,
			noFrontmatter.map((doc) => doc.url),
		);
	}
	return result(
		MARKDOWN_QUALITY,
		"pass",
		`All ${unique.length} markdown documents have frontmatter and balanced code fences.`,
	);
}

function textFile(fetched: Fetched | undefined): string | undefined {
	return isOk(fetched) && !isHtmlResponse(fetched) ? fetched.body : undefined;
}

function llmsTxt(site: SiteArtifacts): CheckResult {
	if (wasNotFetched(site.llmsTxt)) return notFetched(LLMS_TXT, site.llmsTxt, "llms.txt");
	const body = textFile(site.llmsTxt);
	if (body === undefined) {
		const status = isResponse(site.llmsTxt)
			? `HTTP ${site.llmsTxt.status}${isHtmlResponse(site.llmsTxt) ? " with an HTML page" : ""}`
			: `an error (${site.llmsTxt.message})`;
		return result(LLMS_TXT, "fail", `/llms.txt returned ${status}.`);
	}
	const shape = llmsTxtShape(body);
	const problems = [!shape.h1 && "no H1 on the first line", shape.linkItems === 0 && "no markdown link lists"].filter(
		Boolean,
	);
	if (problems.length > 0) return result(LLMS_TXT, "warn", `/llms.txt exists but has ${problems.join(" and ")}.`);
	return result(
		LLMS_TXT,
		"pass",
		`/llms.txt has an H1${shape.summary ? ", a summary" : ""} and ${shape.linkItems} linked entries.`,
	);
}

function llmsTxtLinks(site: SiteArtifacts): CheckResult {
	if (textFile(site.llmsTxt) === undefined)
		return result(LLMS_TXT_LINKS, "not_checked", "There's no llms.txt to check.");
	if (site.llmsLinkProbes.length === 0) {
		return result(LLMS_TXT_LINKS, "not_checked", "llms.txt has no links to this site to probe.");
	}
	const probes = site.llmsLinkProbes.filter((probe) => !wasNotFetched(probe));
	if (probes.length === 0) return notFetched(LLMS_TXT_LINKS, site.llmsLinkProbes[0], "llms.txt links");
	const broken = probes.filter((probe) => !isOk(probe));
	if (broken.length === 0) {
		return result(LLMS_TXT_LINKS, "pass", `Every probed llms.txt link resolves (${count(probes.length, "link")}).`);
	}
	return result(
		LLMS_TXT_LINKS,
		broken.length === probes.length ? "fail" : "warn",
		`${broken.length} of ${probes.length} probed llms.txt links don't resolve.`,
		broken.map((probe) => probe.requestedUrl),
	);
}

function llmsFullTxt(site: SiteArtifacts): CheckResult {
	if (wasNotFetched(site.llmsFullTxt)) return notFetched(LLMS_FULL_TXT, site.llmsFullTxt, "llms-full.txt");
	const fetched = site.llmsFullTxt;
	if (!isResponse(fetched))
		return result(LLMS_FULL_TXT, "warn", `/llms-full.txt couldn't be fetched: ${fetched.message}.`);
	if (fetched.status < 200 || fetched.status >= 300) {
		return result(LLMS_FULL_TXT, "warn", `/llms-full.txt returned HTTP ${fetched.status}.`);
	}
	if (contentType(fetched).includes("html"))
		return result(LLMS_FULL_TXT, "warn", "/llms-full.txt returns an HTML page.");
	return result(LLMS_FULL_TXT, "pass", "/llms-full.txt exists.");
}

function llmsTxtSections(site: SiteArtifacts): CheckResult {
	if (!site.llmsSection) return result(LLMS_TXT_SECTIONS, "not_checked", "No /docs section was found to check.");
	if (wasNotFetched(site.llmsSection)) return notFetched(LLMS_TXT_SECTIONS, site.llmsSection, "/docs/llms.txt");
	if (textFile(site.llmsSection) !== undefined) return result(LLMS_TXT_SECTIONS, "pass", "/docs/llms.txt exists.");
	return result(LLMS_TXT_SECTIONS, "info", "There's a /docs section but no /docs/llms.txt.");
}

function sitemap(site: SiteArtifacts): CheckResult {
	const first = site.sitemap.fetches[0];
	if (wasNotFetched(first)) return notFetched(SITEMAP, first, "the sitemap");
	if (!site.sitemap.valid) {
		const failed = site.sitemap.fetches.at(-1);
		const where = failed?.requestedUrl ?? site.sitemap.url;
		const status = isResponse(failed)
			? `HTTP ${failed.status}`
			: failed?.kind === "error"
				? failed.message
				: "not fetched";
		return result(SITEMAP, "fail", `No valid sitemap at ${where} (${status}).`);
	}
	return result(
		SITEMAP,
		"pass",
		`Valid sitemap at ${site.sitemap.url} with ${site.sitemap.entries.length} entries read.`,
	);
}

function sitemapLastmod(site: SiteArtifacts): CheckResult {
	const entries = site.sitemap.entries;
	if (entries.length === 0) return result(SITEMAP_LASTMOD, "not_checked", "There are no sitemap entries to check.");
	const dated = entries.filter((entry) => entry.lastmod).length;
	const evidence = `${share(dated, entries.length)} of ${entries.length} sitemap entries have a lastmod date.`;
	return result(SITEMAP_LASTMOD, dated / entries.length >= 0.8 ? "pass" : "warn", evidence);
}

const DISCOVERY_RELS = ["sitemap", "describedby", "alternate", "service-doc", "service-desc", "api-catalog"];

function linkHeaders(site: SiteArtifacts): CheckResult {
	const home = site.pages[0]?.html;
	if (!isResponse(home)) return notFetched(LINK_HEADERS, home, "the homepage headers");
	const header = home.headers.link ?? "";
	const rels = header.split(/,(?=\s*<)/).flatMap((entry) => {
		const names = entry.match(/rel="?([^";]+)"?/)?.[1]?.split(/\s+/) ?? [];
		// rel=alternate also carries hreflang translations; only a markdown alternate helps agents.
		const isMarkdown = /type="?text\/markdown/i.test(entry);
		return names.filter((rel) => rel !== "alternate" || isMarkdown);
	});
	const discovery = [...new Set(rels.filter((rel) => DISCOVERY_RELS.includes(rel)))];
	if (discovery.length === 0) return result(LINK_HEADERS, "warn", "The homepage sends no discovery Link header.");
	return result(LINK_HEADERS, "pass", `The homepage Link header advertises ${discovery.join(", ")}.`);
}

function agentView(site: SiteArtifacts): CheckResult {
	const fetched = site.agentView;
	const home = site.pages[0]?.html;
	if (!isResponse(fetched)) return notFetched(AGENT_VIEW, fetched, "?mode=agent");
	if (fetched.status < 200 || fetched.status >= 300) {
		return result(AGENT_VIEW, "info", `\`?mode=agent\` returns HTTP ${fetched.status}.`);
	}
	if (!isOk(home))
		return result(AGENT_VIEW, "not_checked", "The homepage didn't load, so there's nothing to compare against.");
	const distinct = markdownBody(fetched) !== undefined || fetched.body.length < home.body.length * LEANER_VIEW;
	return distinct
		? result(AGENT_VIEW, "pass", "`?mode=agent` returns a leaner view than the homepage.")
		: result(AGENT_VIEW, "info", "`?mode=agent` returns the same page as the homepage.");
}

export function readChecks(site: SiteArtifacts): CheckResult[] {
	return [
		contentNoJs(site),
		tokenBudget(site),
		perPageMarkdown(
			site,
			MARKDOWN_ACCEPT,
			(page) => page.markdownAccept,
			"markdown when asked with `Accept: text/markdown`",
			true,
		),
		perPageMarkdown(site, MARKDOWN_SUFFIX, (page) => page.markdownSuffix, "markdown at a `.md` URL"),
		markdownAlternate(site),
		markdownForBots(site),
		markdownQuality(site),
		llmsTxt(site),
		llmsTxtLinks(site),
		llmsFullTxt(site),
		llmsTxtSections(site),
		sitemap(site),
		sitemapLastmod(site),
		linkHeaders(site),
		agentView(site),
	];
}
