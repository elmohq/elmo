import ReactMarkdown, { type Components, defaultUrlTransform, type UrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";

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
export function ResponseMarkdown({ children }: { children: string }) {
	return (
		<div className="prose prose-sm dark:prose-invert max-w-none break-words">
			<ReactMarkdown remarkPlugins={[remarkGfm]} components={components} urlTransform={urlTransform}>
				{children}
			</ReactMarkdown>
		</div>
	);
}
