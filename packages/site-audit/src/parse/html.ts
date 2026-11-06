/// <reference lib="dom" />
import { parseHTML } from "linkedom";

interface PageLink {
	href: string;
	text: string;
}

export interface ParsedPage {
	url: string;
	title: string;
	lang: string;
	metaDescription: string;
	canonical: string;
	ogImage: string;
	ogType: string;
	robotsMeta: string;
	metaRefresh: boolean;
	jsRedirectStub: boolean;
	text: string;
	headings: { level: number; text: string }[];
	hasMain: boolean;
	links: PageLink[];
	markdownAlternates: string[];
	jsonLd: Record<string, unknown>[];
	controls: { total: number; named: number; nonNative: number; formControls: number; labeledFormControls: number };
	hiddenInstructions: string[];
	metaDates: string[];
	authorMeta: string;
	hasAuthorLink: boolean;
	citablePassages: number;
}

type El = Element & { textContent: string | null };

const INSTRUCTION_PATTERN =
	/\b(ignore (all |any )?(previous|prior|above) (instructions|prompts)|you are (an? )?(ai|assistant|language model|llm|chatbot)|\b(ai|llm|language model)s?( assistants?| agents?| models?)?,? (must|should|always|never) |system prompt|disregard (the|all|any) |when (summari[sz]ing|asked about) this)/i;

const HIDDEN_STYLE =
	/display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0(?![.\d])|(left|top)\s*:\s*-\d{3,}px|opacity\s*:\s*0(?![.\d])/i;

function attr(document: Document, selector: string, name: string): string {
	return document.querySelector(selector)?.getAttribute(name)?.trim() ?? "";
}

function collectJsonLd(document: Document): Record<string, unknown>[] {
	const out: Record<string, unknown>[] = [];
	const visit = (node: unknown) => {
		if (Array.isArray(node)) return node.forEach(visit);
		if (!node || typeof node !== "object") return;
		const record = node as Record<string, unknown>;
		if (record["@graph"]) visit(record["@graph"]);
		if (record["@type"]) out.push(record);
	};
	for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
		try {
			visit(JSON.parse(script.textContent ?? ""));
		} catch {
			// One malformed block shouldn't hide the others.
		}
	}
	return out;
}

type LabelIndex = Map<string, Element>;

// Built once per page so each control's label is a lookup, not another scan of every label on the page.
// Keyed by attribute rather than queried with a `label[for="…"]` selector, so an id never has to be escaped into CSS.
function indexLabels(document: Document): LabelIndex {
	const labels: LabelIndex = new Map();
	for (const label of document.querySelectorAll("label[for]")) {
		const target = label.getAttribute("for");
		if (target && !labels.has(target)) labels.set(target, label);
	}
	return labels;
}

function labelFor(element: Element, labels: LabelIndex): Element | undefined {
	const id = element.getAttribute("id");
	return id ? labels.get(id) : undefined;
}

function accessibleName(element: El, document: Document, labels: LabelIndex): string {
	const labelledBy = element.getAttribute("aria-labelledby");
	if (labelledBy) {
		const text = labelledBy
			.split(/\s+/)
			.map((id) => document.getElementById(id)?.textContent ?? "")
			.join(" ")
			.trim();
		if (text) return text;
	}
	const direct =
		element.getAttribute("aria-label") ??
		element.getAttribute("title") ??
		(element.tagName === "INPUT" ? element.getAttribute("value") : null);
	if (direct?.trim()) return direct.trim();
	const label = labelFor(element, labels);
	if (label?.textContent?.trim()) return label.textContent.trim();
	if (element.closest("label")?.textContent?.trim()) return element.closest("label")?.textContent?.trim() ?? "";
	const imageAlt = [...element.querySelectorAll("img[alt], svg[aria-label]")]
		.map((img) => img.getAttribute("alt") ?? img.getAttribute("aria-label") ?? "")
		.join(" ")
		.trim();
	return (element.textContent ?? "").trim() || imageAlt || element.getAttribute("placeholder")?.trim() || "";
}

type HiddenCache = Map<Element, boolean>;

function hiddenItself(element: Element): boolean {
	return (
		element.hasAttribute("hidden") ||
		element.getAttribute("aria-hidden") === "true" ||
		HIDDEN_STYLE.test(element.getAttribute("style") ?? "")
	);
}

// Memoized per element so deeply nested markup costs one walk up the tree, not one per descendant.
function isHidden(element: Element, cache: HiddenCache): boolean {
	const unresolved: Element[] = [];
	let node: Element | null = element;
	let hidden = false;
	while (node) {
		const cached = cache.get(node);
		if (cached !== undefined) {
			hidden = cached;
			break;
		}
		unresolved.push(node);
		node = node.parentElement;
	}
	for (const ancestor of unresolved.reverse()) {
		hidden ||= hiddenItself(ancestor);
		cache.set(ancestor, hidden);
	}
	return hidden;
}

const FORM_FIELDS = ["INPUT", "SELECT", "TEXTAREA"];
const BUTTON_INPUTS = ["submit", "button", "reset", "image"];

function hasLabel(element: Element, labels: LabelIndex): boolean {
	if (element.getAttribute("aria-label") || element.getAttribute("aria-labelledby") || element.closest("label"))
		return true;
	return labelFor(element, labels) !== undefined;
}

function collectControls(document: Document, hidden: HiddenCache): ParsedPage["controls"] {
	const labels = indexLabels(document);
	const controls = { total: 0, named: 0, nonNative: 0, formControls: 0, labeledFormControls: 0 };
	const interactive = document.querySelectorAll(
		'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="link"]',
	);
	for (const element of interactive) {
		if (isHidden(element, hidden)) continue;
		controls.total++;
		if (accessibleName(element as El, document, labels)) controls.named++;
		const isField =
			FORM_FIELDS.includes(element.tagName) && !BUTTON_INPUTS.includes(element.getAttribute("type") ?? "");
		if (!isField) continue;
		controls.formControls++;
		if (hasLabel(element, labels)) controls.labeledFormControls++;
	}
	for (const element of document.querySelectorAll("div[onclick], span[onclick], div[role=button], span[role=button]")) {
		if (!element.hasAttribute("tabindex")) controls.nonNative++;
	}
	return controls;
}

function collectHiddenInstructions(document: Document, hidden: HiddenCache): string[] {
	const found = new Set<string>();
	for (const element of document.querySelectorAll("body *")) {
		const candidates = [element.getAttribute("aria-label"), element.getAttribute("alt"), element.getAttribute("title")];
		if (isHidden(element, hidden) && element.children.length === 0) candidates.push(element.textContent);
		for (const candidate of candidates) {
			if (candidate && INSTRUCTION_PATTERN.test(candidate)) found.add(candidate.trim().slice(0, 160));
		}
	}
	return [...found];
}

const PASSAGE_MIN_WORDS = 40;
const PASSAGE_MAX_WORDS = 200;

function countCitablePassages(document: Document): number {
	const scope = document.querySelector("main, [role=main], article") ?? document.body;
	if (!scope) return 0;
	return [...scope.querySelectorAll("p, li")].filter((block) => {
		const words = (block.textContent ?? "").trim().split(/\s+/).filter(Boolean).length;
		return words >= PASSAGE_MIN_WORDS && words <= PASSAGE_MAX_WORDS;
	}).length;
}

function hasJsRedirectStub(inlineScripts: string, text: string): boolean {
	if (text.length >= 200) return false;
	return /\b(window\.|document\.)?location(\.href)?\s*=|location\.(replace|assign)\(/.test(inlineScripts);
}

export function parsePage(url: string, html: string): ParsedPage {
	const { document } = parseHTML(html);
	const absolute = (href: string) => {
		if (!href) return "";
		try {
			return new URL(href, url).toString();
		} catch {
			return "";
		}
	};

	// Read before scripts and SVGs are stripped below: JSON-LD lives in script tags, and icon buttons are named by their SVG.
	const jsonLd = collectJsonLd(document);
	const hidden: HiddenCache = new Map();
	const controls = collectControls(document, hidden);
	const inlineScripts = [...document.querySelectorAll("script:not([src])")]
		.map((script) => script.textContent ?? "")
		.join("\n");
	for (const node of document.querySelectorAll("script, style, noscript, template, svg")) node.remove();
	const text = ((document.body as El | null)?.textContent ?? "").replace(/\s+/g, " ").trim();

	return {
		url,
		title: (document.querySelector("title")?.textContent ?? "").trim(),
		lang: attr(document, "html", "lang"),
		metaDescription: attr(document, 'meta[name="description" i]', "content"),
		canonical: absolute(attr(document, 'link[rel="canonical" i]', "href")),
		ogImage: attr(document, 'meta[property="og:image" i]', "content"),
		ogType: attr(document, 'meta[property="og:type" i]', "content"),
		robotsMeta: [...document.querySelectorAll('meta[name="robots" i], meta[name="googlebot" i]')]
			.map((meta) => meta.getAttribute("content") ?? "")
			.join(", ")
			.toLowerCase(),
		metaRefresh: /url\s*=/i.test(attr(document, 'meta[http-equiv="refresh" i]', "content")),
		jsRedirectStub: hasJsRedirectStub(inlineScripts, text),
		text,
		headings: [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].map((heading) => ({
			level: Number(heading.tagName.slice(1)),
			text: (heading.textContent ?? "").trim(),
		})),
		hasMain: document.querySelector('main, [role="main"]') !== null,
		links: [...document.querySelectorAll("a[href]")]
			.map((anchor) => ({ href: absolute(anchor.getAttribute("href") ?? ""), text: (anchor.textContent ?? "").trim() }))
			.filter((link) => link.href.startsWith("http")),
		markdownAlternates: [...document.querySelectorAll('link[rel="alternate" i][type="text/markdown" i]')]
			.map((link) => absolute(link.getAttribute("href") ?? ""))
			.filter(Boolean),
		jsonLd,
		controls,
		hiddenInstructions: collectHiddenInstructions(document, hidden),
		metaDates: [
			...document.querySelectorAll(
				'meta[property="article:modified_time" i], meta[property="article:published_time" i], meta[property="og:updated_time" i]',
			),
		]
			.map((meta) => meta.getAttribute("content") ?? "")
			.filter(Boolean),
		authorMeta: attr(document, 'meta[name="author" i]', "content"),
		hasAuthorLink: document.querySelector('a[rel~="author" i], link[rel~="author" i]') !== null,
		citablePassages: countCitablePassages(document),
	};
}

export function jsonLdTypes(node: Record<string, unknown>): string[] {
	const type = node["@type"];
	return (Array.isArray(type) ? type : [type]).filter((value): value is string => typeof value === "string");
}
