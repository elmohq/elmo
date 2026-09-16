import type { Element, Nodes, Parents, Root } from "hast";
import rehypeParse from "rehype-parse";
import rehypeRemark from "rehype-remark";
import remarkGfm from "remark-gfm";
import remarkStringify from "remark-stringify";
import { unified } from "unified";

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

/** Decorative wrappers carry no content but serialize as stray blank blocks. */
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

export function htmlToMarkdown(html: string, pageUrl: string): string {
	const document = parser.parse(html) as Root;
	const title = findFirst(document, "title");
	const content = findFirst(document, "main") ?? findFirst(document, "body") ?? document;

	clean(content, new URL(pageUrl).origin);

	const heading = title && !findFirst(content, "h1") ? `# ${textOf(title)}\n\n` : "";
	const body = renderer.stringify(renderer.runSync({ type: "root", children: content.children }));

	return `${heading}${body}`.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Agents use the count to budget context before they fetch, so an approximation
 * from the usual ~4 characters per token serves the purpose without shipping a
 * tokenizer for every model that might ask.
 */
export function estimateTokens(markdown: string): number {
	return Math.ceil(markdown.length / 4);
}
