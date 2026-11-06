import {
	isHtmlResponse,
	isOk,
	isResponse,
	type LinkedPage,
	type PageArtifacts,
	parsedPages,
	type SiteArtifacts,
} from "../gather";
import { normalizeHost } from "../hosts";
import { jsonLdTypes, type ParsedPage } from "../parse/html";
import type { CheckResult } from "../types";
import { type CheckDefinition, count, list, notFetched, result, share } from "./result";

const define = (id: string, title: string, fix: string): CheckDefinition => ({ id, group: "understand", title, fix });

const JSON_LD_ORG = define(
	"json-ld-organization",
	"Organization Structured Data",
	"Add Organization JSON-LD to the homepage with name, url, logo, description, and contactPoint or address.",
);
const JSON_LD_SAMEAS = define(
	"json-ld-sameas",
	"Entity Links (sameAs)",
	"List your official profiles (LinkedIn, GitHub, Crunchbase, Wikipedia, X) in the Organization's `sameAs`, so models tie your site to the right entity.",
);
const SCHEMA_BREADTH = define(
	"schema-breadth",
	"Page Structured Data",
	"Mark up pages with the schema.org type that fits them: Article or BlogPosting, Product or SoftwareApplication, FAQPage, HowTo, BreadcrumbList.",
);
const METADATA = define(
	"metadata",
	"Page Metadata",
	"Give every page a unique title, a meta description, a canonical link, `<html lang>`, and og:image and og:type.",
);
const TRUST_PAGES = define(
	"trust-pages",
	"About, Contact, and Privacy Pages",
	"Link About, Contact, and Privacy pages from the homepage. Agents use them to judge who is behind a site.",
);
const PRICING = define(
	"pricing",
	"Pricing Page",
	"If you sell something, link a public pricing page from the homepage, and optionally publish it as markdown at /pricing.md.",
);
const DOCUMENT_STRUCTURE = define(
	"document-structure",
	"Document Structure",
	"Wrap the main content in `<main>`, use one H1 per page, and don't skip heading levels.",
);
const ACCESSIBLE_CONTROLS = define(
	"accessible-controls",
	"Accessible Controls",
	"Give every link, button, and form field an accessible name, label form fields, and use native `<a>` and `<button>` rather than clickable divs.",
);
const HIDDEN_INSTRUCTIONS = define(
	"hidden-instructions",
	"No Hidden Instructions to AI",
	"Remove hidden text or attributes that address AI agents. Models treat it as prompt injection, and it can get a site distrusted.",
);
const FRESHNESS = define(
	"content-freshness",
	"Content Freshness",
	"State when each page was published and last updated: `datePublished` and `dateModified` in JSON-LD (or `article:modified_time`), and keep them accurate. Answer engines favor content they can tell is current.",
);
const CITABLE_PASSAGES = define(
	"citable-passages",
	"Quotable Passages",
	"In articles, write key points as self-contained paragraphs of roughly 40–200 words that answer one question each, so an answer engine can quote them whole.",
);
const AUTHORSHIP = define(
	"authorship",
	"Article Authors",
	"Name the author of each article in JSON-LD (`author` as a Person with `url` or `sameAs`) and on the page, and link to an author page. Named, verifiable authors are an E-E-A-T signal.",
);
const SCHEMA_FEEDS = define(
	"schema-feeds",
	"Schema Feeds (NLWeb)",
	"Optionally add a `schemamap:` line to robots.txt pointing at a feed of your schema.org data, as NLWeb proposes.",
);

const ORGANIZATION_TYPES =
	/^(Organization|Corporation|LocalBusiness|OnlineBusiness|OnlineStore|NGO|EducationalOrganization|GovernmentOrganization|NewsMediaOrganization|SportsOrganization|MedicalOrganization|Store)$/;
const IDENTITY_TYPES =
	/^(Organization|Corporation|OnlineBusiness|WebSite|WebPage|Person|ImageObject|SearchAction|EntryPoint)$/;

function organization(site: SiteArtifacts): Record<string, unknown> | undefined {
	return site.pages[0]?.parsed?.jsonLd.find((node) => jsonLdTypes(node).some((type) => ORGANIZATION_TYPES.test(type)));
}

function jsonLdOrganization(site: SiteArtifacts): CheckResult {
	if (!site.pages[0]?.parsed) return notFetched(JSON_LD_ORG, site.pages[0]?.html, "the homepage");
	const org = organization(site);
	if (!org) return result(JSON_LD_ORG, "fail", "The homepage has no Organization JSON-LD.");
	const missing = [
		!org.name && "name",
		!org.url && "url",
		!org.logo && "logo",
		!org.description && "description",
		!(org.contactPoint || org.address || org.email) && "contactPoint or address",
	].filter((field): field is string => Boolean(field));
	if (missing.length === 0) return result(JSON_LD_ORG, "pass", "The homepage has complete Organization JSON-LD.");
	return result(
		JSON_LD_ORG,
		missing.includes("name") ? "fail" : "warn",
		`Organization JSON-LD is missing ${list(missing)}.`,
	);
}

function jsonLdSameAs(site: SiteArtifacts): CheckResult {
	if (!site.pages[0]?.parsed) return notFetched(JSON_LD_SAMEAS, site.pages[0]?.html, "the homepage");
	const sameAs = organization(site)?.sameAs;
	const links = (Array.isArray(sameAs) ? sameAs : sameAs ? [sameAs] : []).filter(
		(value): value is string => typeof value === "string",
	);
	const hosts = [...new Set(links.map(normalizeHost))];
	if (hosts.length >= 2) return result(JSON_LD_SAMEAS, "pass", `sameAs links to ${list(hosts)}.`);
	if (hosts.length === 1) return result(JSON_LD_SAMEAS, "warn", `sameAs links only to ${hosts[0]}.`);
	return result(JSON_LD_SAMEAS, "fail", "The Organization has no sameAs links.");
}

function schemaBreadth(site: SiteArtifacts): CheckResult {
	const pages = parsedPages(site);
	if (pages.length === 0) return notFetched(SCHEMA_BREADTH, site.pages[0]?.html, "page markup");
	const types = new Set(
		pages
			.flatMap((page) => page.parsed?.jsonLd.flatMap(jsonLdTypes) ?? [])
			.filter((type) => !IDENTITY_TYPES.test(type)),
	);
	if (types.size >= 2) return result(SCHEMA_BREADTH, "pass", `Sampled pages use ${list([...types].slice(0, 6))}.`);
	if (types.size === 1) return result(SCHEMA_BREADTH, "warn", `Sampled pages only use ${[...types][0]}.`);
	return result(SCHEMA_BREADTH, "fail", "Sampled pages have no content-level structured data.");
}

const METADATA_FIELDS: [string, (page: ParsedPage) => string][] = [
	["title", (page) => page.title],
	["meta description", (page) => page.metaDescription],
	["canonical", (page) => page.canonical],
	["lang", (page) => page.lang],
	["og:image", (page) => page.ogImage],
	["og:type", (page) => page.ogType],
];

function metadata(site: SiteArtifacts): CheckResult {
	const pages = parsedPages(site).flatMap((page) => (page.parsed ? [page.parsed] : []));
	if (pages.length === 0) return notFetched(METADATA, site.pages[0]?.html, "page markup");
	const gaps = METADATA_FIELDS.map(([field, read]) => ({
		field,
		urls: pages.filter((page) => !read(page)).map((page) => page.url),
	})).filter((gap) => gap.urls.length > 0);
	const titles = pages.map((page) => page.title).filter(Boolean);
	const duplicated = new Set(titles).size < titles.length;
	if (gaps.length === 0 && !duplicated) {
		return result(METADATA, "pass", `All ${pages.length} sampled pages have unique titles and complete metadata.`);
	}
	const parts = gaps.map((gap) => `${gap.field} missing on ${count(gap.urls.length, "page")}`);
	if (duplicated) parts.push("duplicate titles");
	const critical = gaps.some((gap) => gap.field === "title" || gap.field === "meta description");
	return result(METADATA, critical ? "fail" : "warn", `${list(parts)}.`, [...new Set(gaps.flatMap((gap) => gap.urls))]);
}

function linkedPageState(page: LinkedPage): "missing" | "broken" | "ok" | "unchecked" {
	if (!page.href) return "missing";
	if (!page.fetched || page.fetched.kind === "skipped") return "unchecked";
	return isOk(page.fetched) ? "ok" : "broken";
}

function trustPages(site: SiteArtifacts): CheckResult {
	if (!site.pages[0]?.parsed) return notFetched(TRUST_PAGES, site.pages[0]?.html, "the homepage");
	const states = Object.entries(site.trust).map(([name, page]) => ({ name, state: linkedPageState(page) }));
	if (states.every((entry) => entry.state === "unchecked"))
		return notFetched(TRUST_PAGES, site.trust.about.fetched, "the linked pages");
	const bad = states.filter((entry) => entry.state === "missing" || entry.state === "broken");
	if (bad.length === 0)
		return result(TRUST_PAGES, "pass", "About, Contact, and Privacy pages are linked from the homepage.");
	const describe = bad.map((entry) => `${entry.name} ${entry.state === "missing" ? "isn't linked" : "doesn't load"}`);
	return result(TRUST_PAGES, bad.length === states.length ? "fail" : "warn", `${list(describe)}.`);
}

function pricing(site: SiteArtifacts): CheckResult {
	if (!site.pages[0]?.parsed) return notFetched(PRICING, site.pages[0]?.html, "the homepage");
	const state = linkedPageState(site.pricing);
	if (state === "missing") return result(PRICING, "info", "No pricing page is linked from the homepage.");
	if (state === "broken") return result(PRICING, "warn", `The pricing link (${site.pricing.href}) doesn't load.`);
	if (state === "unchecked") return notFetched(PRICING, site.pricing.fetched, "the pricing page");
	const markdown =
		isOk(site.pricing.markdown) && !isHtmlResponse(site.pricing.markdown) ? " It's also published as markdown." : "";
	return result(PRICING, "pass", `A pricing page is linked from the homepage.${markdown}`);
}

function documentStructure(site: SiteArtifacts): CheckResult {
	const pages = parsedPages(site);
	if (pages.length === 0) return notFetched(DOCUMENT_STRUCTURE, site.pages[0]?.html, "page markup");
	const issues = pages.flatMap((page) => {
		const meta = page.parsed;
		if (!meta) return [];
		const h1s = meta.headings.filter((heading) => heading.level === 1).length;
		const skips = meta.headings.some((heading, i) => i > 0 && heading.level - (meta.headings[i - 1]?.level ?? 1) > 1);
		const problems = [
			!meta.hasMain && "no <main>",
			h1s === 0 && "no H1",
			h1s > 1 && "more than one H1",
			skips && "skipped heading levels",
		].filter((problem): problem is string => Boolean(problem));
		return problems.length > 0 ? [{ url: page.url, problems }] : [];
	});
	if (issues.length === 0)
		return result(
			DOCUMENT_STRUCTURE,
			"pass",
			`All ${pages.length} sampled pages have a <main>, one H1, and ordered headings.`,
		);
	const kinds = [...new Set(issues.flatMap((issue) => issue.problems))];
	return result(
		DOCUMENT_STRUCTURE,
		"warn",
		`${issues.length} of ${pages.length} pages have structure issues (${list(kinds)}).`,
		issues.map((issue) => issue.url),
	);
}

function accessibleControls(site: SiteArtifacts): CheckResult {
	const pages = parsedPages(site);
	if (pages.length === 0) return notFetched(ACCESSIBLE_CONTROLS, site.pages[0]?.html, "page markup");
	const totals = pages.reduce(
		(sum, page) => {
			const controls = page.parsed?.controls;
			if (!controls) return sum;
			return {
				total: sum.total + controls.total,
				named: sum.named + controls.named,
				nonNative: sum.nonNative + controls.nonNative,
				formControls: sum.formControls + controls.formControls,
				labeled: sum.labeled + controls.labeledFormControls,
			};
		},
		{ total: 0, named: 0, nonNative: 0, formControls: 0, labeled: 0 },
	);
	if (totals.total === 0) return result(ACCESSIBLE_CONTROLS, "pass", "The sampled pages have no interactive controls.");
	const namedShare = totals.named / totals.total;
	const unlabeled = totals.formControls - totals.labeled;
	const evidence = `${totals.named} of ${totals.total} controls have an accessible name (${share(totals.named, totals.total)}); ${count(unlabeled, "unlabeled form field")}; ${count(totals.nonNative, "clickable non-native element")}.`;
	if (namedShare >= 0.95 && unlabeled === 0 && totals.nonNative === 0)
		return result(ACCESSIBLE_CONTROLS, "pass", evidence);
	return result(ACCESSIBLE_CONTROLS, namedShare >= 0.8 ? "warn" : "fail", evidence);
}

function hiddenInstructions(site: SiteArtifacts): CheckResult {
	const pages = parsedPages(site);
	if (pages.length === 0) return notFetched(HIDDEN_INSTRUCTIONS, site.pages[0]?.html, "page markup");
	const flagged = pages.filter((page) => (page.parsed?.hiddenInstructions.length ?? 0) > 0);
	if (flagged.length === 0)
		return result(
			HIDDEN_INSTRUCTIONS,
			"pass",
			`No hidden instructions to AI found across ${count(pages.length, "page")}.`,
		);
	const sample = flagged[0]?.parsed?.hiddenInstructions[0] ?? "";
	return result(
		HIDDEN_INSTRUCTIONS,
		"warn",
		`Hidden text addressed to AI on ${count(flagged.length, "page")}, for example "${sample}".`,
		flagged.map((page) => page.url),
	);
}

const STALE_AFTER_MS = 365 * 24 * 60 * 60 * 1000;
const EDITORIAL_TYPES =
	/^(Article|BlogPosting|NewsArticle|OpinionNewsArticle|ReportageNewsArticle|AnalysisNewsArticle|Report|ScholarlyArticle)$/;

// Docs are TechArticles: schema.org's type for how-tos and reference, which are judged as docs, not as bylined editorial.
function isEditorial(page: PageArtifacts): boolean {
	const types = page.parsed?.jsonLd.flatMap(jsonLdTypes) ?? [];
	if (types.includes("TechArticle")) return false;
	return types.some((type) => EDITORIAL_TYPES.test(type)) || page.parsed?.ogType === "article";
}

function pageDates(page: PageArtifacts): { dates: Date[]; source: "structured" | "header" | "none" } {
	const meta = page.parsed;
	const structured = [
		...(meta?.jsonLd.flatMap((node) => [node.dateModified, node.datePublished]) ?? []),
		...(meta?.metaDates ?? []),
	]
		.filter((value): value is string => typeof value === "string")
		.map((value) => new Date(value))
		.filter((date) => !Number.isNaN(date.getTime()));
	if (structured.length > 0) return { dates: structured, source: "structured" };
	const header = isResponse(page.html) ? page.html.headers["last-modified"] : undefined;
	const fromHeader = header ? new Date(header) : undefined;
	return fromHeader && !Number.isNaN(fromHeader.getTime())
		? { dates: [fromHeader], source: "header" }
		: { dates: [], source: "none" };
}

function freshness(site: SiteArtifacts): CheckResult {
	const pages = parsedPages(site);
	if (pages.length === 0) return notFetched(FRESHNESS, site.pages[0]?.html, "page markup");
	const dated = pages.map((page) => ({ url: page.url, ...pageDates(page) })).filter((page) => page.source !== "none");
	const undated = pages.filter((page) => !dated.some((d) => d.url === page.url)).map((page) => page.url);
	if (dated.length === 0)
		return result(FRESHNESS, "warn", "None of the sampled pages says when it was published or updated.", undated);
	const newest = new Date(Math.max(...dated.flatMap((page) => page.dates.map((date) => date.getTime()))));
	const structuredCount = dated.filter((page) => page.source === "structured").length;
	const evidence = `${dated.length} of ${pages.length} pages carry a date (${structuredCount} in structured data or meta tags); the newest is ${newest.toISOString().slice(0, 10)}.`;
	if (Date.now() - newest.getTime() > STALE_AFTER_MS)
		return result(FRESHNESS, "warn", `${evidence} Nothing sampled was updated in the past year.`);
	if (structuredCount < pages.length / 2) return result(FRESHNESS, "warn", evidence, undated);
	return result(FRESHNESS, "pass", evidence);
}

const MIN_PASSAGES = 3;

function citablePassages(site: SiteArtifacts): CheckResult {
	const articles = parsedPages(site).filter(isEditorial);
	if (articles.length === 0) return result(CITABLE_PASSAGES, "not_checked", "No article pages were in the sample.");
	const counts = articles.map((page) => ({ url: page.url, passages: page.parsed?.citablePassages ?? 0 }));
	const strong = counts.filter((page) => page.passages >= MIN_PASSAGES);
	const total = counts.reduce((sum, page) => sum + page.passages, 0);
	const evidence = `${strong.length} of ${articles.length} article pages have at least ${MIN_PASSAGES} quotable passages of 40–200 words (${total} in all).`;
	const weak = counts.filter((page) => page.passages < MIN_PASSAGES).map((page) => page.url);
	if (strong.length >= articles.length / 2) return result(CITABLE_PASSAGES, "pass", evidence);
	return result(CITABLE_PASSAGES, total === 0 ? "fail" : "warn", evidence, weak);
}

function articleAuthor(page: PageArtifacts): "verifiable" | "named" | "none" {
	const meta = page.parsed;
	if (!meta) return "none";
	const authors = meta.jsonLd.flatMap((node) => {
		const author = node.author;
		return (Array.isArray(author) ? author : author ? [author] : []) as unknown[];
	});
	const verifiable = authors.some(
		(author) => typeof author === "object" && author !== null && ("url" in author || "sameAs" in author),
	);
	if (verifiable || (authors.length > 0 && meta.hasAuthorLink)) return "verifiable";
	const publisher = meta.jsonLd.some((node) => node.publisher);
	return authors.length > 0 || publisher || meta.authorMeta || meta.hasAuthorLink ? "named" : "none";
}

function authorship(site: SiteArtifacts): CheckResult {
	const articles = parsedPages(site).filter(isEditorial);
	if (articles.length === 0) return result(AUTHORSHIP, "not_checked", "No article pages were in the sample.");
	const states = articles.map((page) => ({ url: page.url, state: articleAuthor(page) }));
	const anonymous = states.filter((page) => page.state === "none");
	const unverified = states.filter((page) => page.state === "named");
	const evidence = `${articles.length - anonymous.length} of ${articles.length} article pages name an author or publisher; ${states.filter((page) => page.state === "verifiable").length} link the author to a profile.`;
	if (anonymous.length > 0 || unverified.length > 0) {
		return result(
			AUTHORSHIP,
			"warn",
			evidence,
			[...anonymous, ...unverified].map((page) => page.url),
		);
	}
	return result(AUTHORSHIP, "pass", evidence);
}

function schemaFeeds(site: SiteArtifacts): CheckResult {
	if (!site.robots) return result(SCHEMA_FEEDS, "not_checked", "There's no robots.txt to check.");
	if (site.robots.schemamaps.length > 0)
		return result(SCHEMA_FEEDS, "pass", `robots.txt declares schemamap: ${site.robots.schemamaps[0]}.`);
	return result(SCHEMA_FEEDS, "info", "robots.txt has no schemamap line.");
}

export function understandChecks(site: SiteArtifacts): CheckResult[] {
	return [
		jsonLdOrganization(site),
		jsonLdSameAs(site),
		schemaBreadth(site),
		metadata(site),
		freshness(site),
		citablePassages(site),
		authorship(site),
		trustPages(site),
		pricing(site),
		documentStructure(site),
		accessibleControls(site),
		hiddenInstructions(site),
		schemaFeeds(site),
	];
}
