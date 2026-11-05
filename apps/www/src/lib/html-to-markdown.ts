import type { Element, Nodes, Parents, Root } from "hast";
import rehypeParse from "rehype-parse";
import rehypeRemark from "rehype-remark";
import remarkGfm from "remark-gfm";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { withFrontmatter } from "@/lib/frontmatter";

const DROPPED_TAGS = new Set(["script", "style", "noscript", "template", "svg", "canvas", "iframe", "dialog"]);

const parser = unified().use(rehypeParse);

const renderer = unified()
	.use(rehypeRemark)
	.use(remarkGfm)
	.use(remarkStringify, { bullet: "-", emphasis: "_", fences: true, rule: "-" });

function isElement(node: Nodes): node is Element {
	return node.type === "element";
}

function findFirst(parent: Parents, tagName: string): Element | undefined {
	for (const child of parent.children) {
		if (!isElement(child)) continue;
		if (child.tagName === tagName) return child;
		const nested = findFirst(child, tagName);
		if (nested) return nested;
	}
}

function textOf(parent: Parents): string {
	return parent.children
		.map((child) => (child.type === "text" ? child.value : isElement(child) ? textOf(child) : ""))
		.join("")
		.trim();
}

function isNoise(node: Element): boolean {
	return DROPPED_TAGS.has(node.tagName) || node.properties.ariaHidden === "true" || node.properties.hidden === true;
}

function absolutize(node: Element, origin: string): void {
	for (const key of ["href", "src"] as const) {
		const value = node.properties[key];
		if (typeof value === "string" && value.startsWith("/") && !value.startsWith("//")) {
			node.properties[key] = `${origin}${value}`;
		}
	}
}

function clean(parent: Parents, origin: string): void {
	// The renderer separates adjacent text nodes with empty comments, which
	// otherwise survive into the markdown and split words apart.
	parent.children = parent.children.filter(
		(child) => child.type !== "comment" && (!isElement(child) || !isNoise(child)),
	);
	for (const child of parent.children) {
		if (!isElement(child)) continue;
		absolutize(child, origin);
		clean(child, origin);
	}
}

function jsonLdDateModified(json: string): string | undefined {
	try {
		const data = JSON.parse(json) as { dateModified?: unknown; "@graph"?: { dateModified?: unknown }[] };
		const nodes = [data, ...(data["@graph"] ?? [])];
		const found = nodes.map((node) => node.dateModified).find((value) => typeof value === "string");
		return found as string | undefined;
	} catch {
		return undefined;
	}
}

function headMeta(head: Element | undefined): Record<string, string> {
	const meta: Record<string, string> = {};
	for (const child of head?.children ?? []) {
		if (!isElement(child)) continue;
		const { name, property, content, rel, href } = child.properties;
		if (child.tagName === "meta" && name === "description" && typeof content === "string") meta.description = content;
		if (child.tagName === "meta" && property === "article:modified_time" && typeof content === "string") {
			meta.updated = content;
		}
		if (child.tagName === "link" && Array.isArray(rel) && rel.includes("canonical") && typeof href === "string") {
			meta.canonical = href;
		}
		if (child.tagName === "script" && child.properties.type === "application/ld+json" && !meta.updated) {
			const dateModified = jsonLdDateModified(textOf(child));
			if (dateModified) meta.updated = dateModified;
		}
	}
	return meta;
}

export function htmlToMarkdown(html: string, pageUrl: string): string {
	const document = parser.parse(html) as Root;
	const title = findFirst(document, "title");
	const meta = { title: title ? textOf(title) : undefined, ...headMeta(findFirst(document, "head")) };
	const content = findFirst(document, "main") ?? findFirst(document, "body") ?? document;

	clean(content, new URL(pageUrl).origin);

	const heading = title && !findFirst(content, "h1") ? `# ${textOf(title)}\n\n` : "";
	const body = renderer.stringify(renderer.runSync({ type: "root", children: content.children }));

	return withFrontmatter(`${heading}${body}`.replace(/\n{3,}/g, "\n\n").trim(), meta);
}
