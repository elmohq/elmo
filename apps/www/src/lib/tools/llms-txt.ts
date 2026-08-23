/**
 * Renders the llms.txt file itself, in the format described at llmstxt.org: an
 * H1 with the site name, an optional blockquote summary, then H2 sections of
 * annotated links.
 *
 * Pure — no network, no Node built-ins.
 */
import { titleFromUrl } from "./html-meta";

export interface LlmsTxtPage {
	url: string;
	title: string | null;
	description: string | null;
}

export interface LlmsTxtSection {
	name: string;
	pages: LlmsTxtPage[];
}

const MAX_NOTE_LENGTH = 160;
/** Top-level segments worth naming outright rather than title-casing blindly. */
const SECTION_NAMES: Record<string, string> = {
	docs: "Docs",
	doc: "Docs",
	documentation: "Docs",
	blog: "Blog",
	posts: "Blog",
	news: "News",
	guides: "Guides",
	api: "API",
	faq: "FAQ",
};

function humanize(segment: string): string {
	return decodeURIComponent(segment)
		.replace(/[-_]+/g, " ")
		.split(" ")
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

function sectionFor(url: string): string {
	let segments: string[];
	try {
		segments = new URL(url).pathname.split("/").filter(Boolean);
	} catch {
		return "Pages";
	}

	if (segments.length <= 1) return "Main";
	const key = segments[0].toLowerCase();
	return SECTION_NAMES[key] ?? humanize(segments[0]);
}

function truncateNote(note: string): string {
	const single = note.replace(/\s+/g, " ").trim();
	if (single.length <= MAX_NOTE_LENGTH) return single;
	return `${single.slice(0, MAX_NOTE_LENGTH - 1).trimEnd()}…`;
}

/** "Main" leads; the rest are ordered by size so the biggest areas come first. */
export function groupPages(pages: LlmsTxtPage[]): LlmsTxtSection[] {
	const sections = new Map<string, LlmsTxtPage[]>();

	for (const page of pages) {
		const name = sectionFor(page.url);
		const bucket = sections.get(name);
		if (bucket) bucket.push(page);
		else sections.set(name, [page]);
	}

	return [...sections.entries()]
		.map(([name, sectionPages]) => ({
			name,
			pages: [...sectionPages].sort((a, b) => a.url.localeCompare(b.url)),
		}))
		.sort((a, b) => {
			if (a.name === "Main") return -1;
			if (b.name === "Main") return 1;
			if (a.pages.length !== b.pages.length) return b.pages.length - a.pages.length;
			return a.name.localeCompare(b.name);
		});
}

export function buildLlmsTxt(input: {
	siteName: string;
	siteDescription: string | null;
	pages: LlmsTxtPage[];
}): string {
	const lines: string[] = [`# ${input.siteName}`];

	if (input.siteDescription) {
		lines.push("", `> ${truncateNote(input.siteDescription)}`);
	}

	for (const section of groupPages(input.pages)) {
		lines.push("", `## ${section.name}`, "");
		for (const page of section.pages) {
			const title = page.title?.trim() || titleFromUrl(page.url);
			const note = page.description ? `: ${truncateNote(page.description)}` : "";
			lines.push(`- [${title}](${page.url})${note}`);
		}
	}

	return `${lines.join("\n")}\n`;
}
