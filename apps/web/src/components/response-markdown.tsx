import type { ReactNode } from "react";
import ReactMarkdown, { type Components, defaultUrlTransform, type UrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { HIGHLIGHT_CLASS, type MarkRange, rehypeHighlight, rehypeMarkRange } from "@/lib/highlight";

/**
 * Engines inline their source favicons as `data:image/…` payloads, which the
 * default transform blanks out into broken-image icons. Widened for image
 * sources only — a `data:` URL is inert in `<img>`, but in an `<a href>` it is
 * a script vector, so links keep the stock rules.
 */
const urlTransform: UrlTransform = (url, key, node) => {
	if (key === "src" && node.tagName === "img") {
		if (/^data:image\//i.test(url)) return url;
		// Relative sources could make authenticated requests against this app,
		// while protocol-relative sources obscure the destination's scheme.
		if (!URL.canParse(url)) return "";
	}
	return defaultUrlTransform(url);
};

const components: Components = {
	mark: ({ className, children, node }) => (
		<mark className={className ?? HIGHLIGHT_CLASS} data-passage={node?.properties?.dataPassage ? "" : undefined}>
			{children}
		</mark>
	),
	// Answers link out to their sources, so a plain click would navigate the
	// dashboard away to a third-party page.
	a: ({ href, children }) => (
		<a href={href} target="_blank" rel="noopener noreferrer">
			{children}
		</a>
	),
	// Tables are as wide as the model wants; the answer box is not.
	table: ({ children }) => (
		<div className="overflow-x-auto">
			<table>{children}</table>
		</div>
	),
	// The images engines inline are source favicons and ad thumbnails, served at
	// their own resolution (128px squares are typical) and with no alt text.
	// Sized to the text they sit beside they read as the chips they are, instead
	// of breaking the answer into a column of logos.
	img: ({ src, alt }) =>
		typeof src === "string" && src ? (
			<img
				src={src}
				alt={alt ?? ""}
				className="my-0 inline h-[1.2em] w-auto align-middle"
				loading="lazy"
				referrerPolicy="no-referrer"
			/>
		) : null,
};

/**
 * Renders an answer-engine answer as markdown.
 *
 * GFM is what makes this readable: engines answer comparison prompts with pipe
 * tables, and CommonMark alone leaves those as a wall of literal `|`.
 */
export function ResponseMarkdown({
	children,
	highlight,
	markRange,
}: {
	children: string;
	highlight?: string;
	markRange?: MarkRange;
}) {
	return (
		<div className="prose prose-sm dark:prose-invert max-w-none break-words">
			<ReactMarkdown
				remarkPlugins={[remarkGfm]}
				rehypePlugins={[
					...(markRange ? [rehypeMarkRange(markRange)] : []),
					...(highlight ? [rehypeHighlight(highlight)] : []),
				]}
				components={components}
				urlTransform={urlTransform}
			>
				{children}
			</ReactMarkdown>
		</div>
	);
}

const HEADINGS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

/** Inline marks and headings survive; everything else (lists, paragraphs, tables) gives up its text. */
const INLINE_ELEMENTS = ["strong", "em", "del", "code", "a", ...HEADINGS];

/** A heading set into running text would read as the start of its first sentence. */
const runInHeading = ({ children }: { children?: ReactNode }) => (
	<>
		<strong>{children}</strong> —{" "}
	</>
);

const inlineComponents: Components = {
	a: components.a,
	...Object.fromEntries(HEADINGS.map((tag) => [tag, runInHeading])),
};

/**
 * Renders an excerpt of an answer as a single run of text. A passage lifted
 * from mid-answer starts wherever the passage did — inside a list item, under
 * a heading — and rendering that structure makes excerpts shown side by side
 * look inconsistently spaced, so only the inline emphasis is kept.
 */
export function InlineMarkdown({ children }: { children: string }) {
	// A passage cut from a nested list keeps its indentation, which markdown would read as a code block.
	const dedented = children.replace(/^[ \t]+/gm, "");
	return (
		<ReactMarkdown
			remarkPlugins={[remarkGfm]}
			allowedElements={INLINE_ELEMENTS}
			unwrapDisallowed
			components={inlineComponents}
			urlTransform={urlTransform}
		>
			{dedented}
		</ReactMarkdown>
	);
}
