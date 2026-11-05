/// <reference lib="dom" />
import { parseHTML } from "linkedom";

export interface PageLink {
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
	/** Visible text from the server HTML, scripts and styles removed. */
	text: string;
	htmlLength: number;
	headings: { level: number; text: string }[];
	hasMain: boolean;
	landmarks: string[];
	links: PageLink[];
	markdownAlternates: string[];
	jsonLd: Record<string, unknown>[];
	controls: { total: number; named: number; nonNative: number; formControls: number; labeledFormControls: number };
	hiddenInstructions: string[];
}

type El = Element & { textContent: string | null };

const INSTRUCTION_PATTERN =
	/\b(ignore (all |any )?(previous|prior|above) (instructions|prompts)|you are (an? )?(ai|assistant|language model|llm|chatbot)|(ai|llm|language model|assistant|agent)s?,? (must|should|always|never) |system prompt|disregard (the|all|any) |when (summari[sz]ing|asked about) this)/i;

const HIDDEN_STYLE =
	/display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0(?![.\d])|(left|top)\s*:\s*-\d{3,}px|opacity\s*:\s*0(?![.\d])/i;

const LANDMARK_ROLES = { header: "banner", nav: "navigation", main: "main", footer: "contentinfo" };

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

// Matched by attribute rather than a `label[for="…"]` selector, so an id never has to be escaped into CSS.
function labelFor(element: Element, document: Document): Element | undefined {
	const id = element.getAttribute("id");
	if (!id) return undefined;
	return [...document.querySelectorAll("label[for]")].find((label) => label.getAttribute("for") === id);
}

function accessibleName(element: El, document: Document): string {
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
	const label = labelFor(element, document);
	if (label?.textContent?.trim()) return label.textContent.trim();
	if (element.closest("label")?.textContent?.trim()) return element.closest("label")?.textContent?.trim() ?? "";
	const imageAlt = [...element.querySelectorAll("img[alt], svg[aria-label]")]
		.map((img) => img.getAttribute("alt") ?? img.getAttribute("aria-label") ?? "")
		.join(" ")
		.trim();
	return (element.textContent ?? "").trim() || imageAlt || element.getAttribute("placeholder")?.trim() || "";
}

function isHidden(element: Element): boolean {
	for (let node: Element | null = element; node; node = node.parentElement) {
		if (node.hasAttribute("hidden") || node.getAttribute("aria-hidden") === "true") return true;
		if (HIDDEN_STYLE.test(node.getAttribute("style") ?? "")) return true;
	}
	return false;
}

const FORM_FIELDS = ["INPUT", "SELECT", "TEXTAREA"];
const BUTTON_INPUTS = ["submit", "button", "reset", "image"];

function hasLabel(element: Element, document: Document): boolean {
	if (element.getAttribute("aria-label") || element.getAttribute("aria-labelledby") || element.closest("label"))
		return true;
	return labelFor(element, document) !== undefined;
}

function collectControls(document: Document): ParsedPage["controls"] {
	const controls = { total: 0, named: 0, nonNative: 0, formControls: 0, labeledFormControls: 0 };
	const interactive = document.querySelectorAll(
		'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="link"]',
	);
	for (const element of interactive) {
		if (isHidden(element)) continue;
		controls.total++;
		if (accessibleName(element as El, document)) controls.named++;
		const isField =
			FORM_FIELDS.includes(element.tagName) && !BUTTON_INPUTS.includes(element.getAttribute("type") ?? "");
		if (!isField) continue;
		controls.formControls++;
		if (hasLabel(element, document)) controls.labeledFormControls++;
	}
	for (const element of document.querySelectorAll("div[onclick], span[onclick], div[role=button], span[role=button]")) {
		if (!element.hasAttribute("tabindex")) controls.nonNative++;
	}
	return controls;
}

function collectHiddenInstructions(document: Document): string[] {
	const found = new Set<string>();
	for (const element of document.querySelectorAll("body *")) {
		const candidates = [element.getAttribute("aria-label"), element.getAttribute("alt"), element.getAttribute("title")];
		if (isHidden(element) && element.children.length === 0) candidates.push(element.textContent);
		for (const candidate of candidates) {
			if (candidate && INSTRUCTION_PATTERN.test(candidate)) found.add(candidate.trim().slice(0, 160));
		}
	}
	return [...found];
}

function hasJsRedirectStub(inlineScripts: string, text: string): boolean {
	if (text.length >= 200) return false;
	return /\b(window\.|document\.)?location(\.href)?\s*=|location\.(replace|assign)\(/.test(inlineScripts);
}

export function parsePage(url: string, html: string): ParsedPage {
	const { document } = parseHTML(html);
	const absolute = (href: string) => {
		try {
			return new URL(href, url).toString();
		} catch {
			return "";
		}
	};

	// Read before scripts are stripped below: JSON-LD lives in script tags.
	const jsonLd = collectJsonLd(document);
	const inlineScripts = [...document.querySelectorAll("script:not([src])")]
		.map((script) => script.textContent ?? "")
		.join("\n");
	for (const node of document.querySelectorAll("script, style, noscript, template, svg")) node.remove();
	const text = ((document.body as El | null)?.textContent ?? "").replace(/\s+/g, " ").trim();
	const landmarks = Object.entries(LANDMARK_ROLES)
		.filter(([tag, role]) => document.querySelector(`${tag}, [role="${role}"]`) !== null)
		.map(([tag]) => tag);

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
		metaRefresh: document.querySelector('meta[http-equiv="refresh" i]') !== null,
		jsRedirectStub: hasJsRedirectStub(inlineScripts, text),
		text,
		htmlLength: html.length,
		headings: [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].map((heading) => ({
			level: Number(heading.tagName.slice(1)),
			text: (heading.textContent ?? "").trim(),
		})),
		hasMain: landmarks.includes("main"),
		landmarks,
		links: [...document.querySelectorAll("a[href]")]
			.map((anchor) => ({ href: absolute(anchor.getAttribute("href") ?? ""), text: (anchor.textContent ?? "").trim() }))
			.filter((link) => link.href.startsWith("http")),
		markdownAlternates: [...document.querySelectorAll('link[rel="alternate" i][type="text/markdown" i]')]
			.map((link) => absolute(link.getAttribute("href") ?? ""))
			.filter(Boolean),
		jsonLd,
		controls: collectControls(document),
		hiddenInstructions: collectHiddenInstructions(document),
	};
}

export function jsonLdTypes(node: Record<string, unknown>): string[] {
	const type = node["@type"];
	return (Array.isArray(type) ? type : [type]).filter((value): value is string => typeof value === "string");
}
