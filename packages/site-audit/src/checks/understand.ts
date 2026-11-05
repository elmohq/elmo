import { isHtmlResponse, isOk, type LinkedPage, type PageArtifacts, type SiteArtifacts } from "../gather";
import { jsonLdTypes, type ParsedPage } from "../parse/html";
import type { CheckResult } from "../types";
import { type CheckDefinition, list, notFetched, result, share } from "./result";

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
const SCHEMA_FEEDS = define(
	"schema-feeds",
	"Schema Feeds (NLWeb)",
	"Optionally add a `schemamap:` line to robots.txt pointing at a feed of your schema.org data, as NLWeb proposes.",
);

const ORGANIZATION_TYPES =
	/^(Organization|Corporation|LocalBusiness|OnlineBusiness|OnlineStore|NGO|EducationalOrganization|GovernmentOrganization|NewsMediaOrganization|SportsOrganization|MedicalOrganization|Store)$/;
const IDENTITY_TYPES =
	/^(Organization|Corporation|OnlineBusiness|WebSite|WebPage|Person|ImageObject|SearchAction|EntryPoint)$/;

function parsed(site: SiteArtifacts): PageArtifacts[] {
	return site.pages.filter((page) => page.parsed);
}

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
	const hosts = [
		...new Set(
			links.flatMap((link) => {
				try {
					return [new URL(link).hostname.replace(/^www\./, "")];
				} catch {
					return [];
				}
			}),
		),
	];
	if (hosts.length >= 2) return result(JSON_LD_SAMEAS, "pass", `sameAs links to ${list(hosts)}.`);
	if (hosts.length === 1) return result(JSON_LD_SAMEAS, "warn", `sameAs links only to ${hosts[0]}.`);
	return result(JSON_LD_SAMEAS, "fail", "The Organization has no sameAs links.");
}

function schemaBreadth(site: SiteArtifacts): CheckResult {
	const pages = parsed(site);
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
	const pages = parsed(site).flatMap((page) => (page.parsed ? [page.parsed] : []));
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
	const parts = gaps.map((gap) => `${gap.field} missing on ${gap.urls.length} page(s)`);
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
	const markdown =
		isOk(site.pricing.markdown) && !isHtmlResponse(site.pricing.markdown) ? " It's also published as markdown." : "";
	return result(PRICING, "pass", `A pricing page is linked from the homepage.${markdown}`);
}

function documentStructure(site: SiteArtifacts): CheckResult {
	const pages = parsed(site);
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
	const pages = parsed(site);
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
	const evidence = `${totals.named} of ${totals.total} controls have an accessible name (${share(totals.named, totals.total)}); ${unlabeled} unlabeled form field(s); ${totals.nonNative} clickable non-native element(s).`;
	if (namedShare >= 0.95 && unlabeled === 0 && totals.nonNative === 0)
		return result(ACCESSIBLE_CONTROLS, "pass", evidence);
	return result(ACCESSIBLE_CONTROLS, namedShare >= 0.8 ? "warn" : "fail", evidence);
}

function hiddenInstructions(site: SiteArtifacts): CheckResult {
	const pages = parsed(site);
	if (pages.length === 0) return notFetched(HIDDEN_INSTRUCTIONS, site.pages[0]?.html, "page markup");
	const flagged = pages.filter((page) => (page.parsed?.hiddenInstructions.length ?? 0) > 0);
	if (flagged.length === 0)
		return result(HIDDEN_INSTRUCTIONS, "pass", `No hidden instructions to AI found across ${pages.length} pages.`);
	const sample = flagged[0]?.parsed?.hiddenInstructions[0] ?? "";
	return result(
		HIDDEN_INSTRUCTIONS,
		"fail",
		`${flagged.length} page(s) contain hidden text addressed to AI, for example "${sample}".`,
		flagged.map((page) => page.url),
	);
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
		trustPages(site),
		pricing(site),
		documentStructure(site),
		accessibleControls(site),
		hiddenInstructions(site),
		schemaFeeds(site),
	];
}
