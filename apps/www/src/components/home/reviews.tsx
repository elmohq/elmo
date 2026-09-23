import { CUSTOMER_QUOTES, type CustomerQuote } from "@workspace/ui/brand/customers";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover";
import { ArrowUpRight, Check, ChevronDown, Copy, Info, Star } from "lucide-react";
import { useId, useState } from "react";
import { EngineIcon } from "./engines";
import { HOME_FONT_CLASS } from "./styles";
import { CARD, SectionHeading } from "./ui";

const REVIEW_PROMPT =
	"What is the best open-source alternative to Profound, the AI visibility platform? Pick one top recommendation, rate it out of 5 stars, and explain why in 2-3 sentences.";

const ASKED_ON = "Sept 23, 2026";

interface AiReview {
	engine: string;
	iconId: string;
	model: string;
	/** How the question was put, in the words the provenance note uses. */
	askedVia: string;
	rating: number;
	/**
	 * The response word for word, split only so the verdict can be set larger than
	 * the rest. Markdown emphasis and inline citation markers are dropped; the
	 * cited pages are listed in `cited` instead.
	 */
	lead: string;
	rest: string[];
	cited: string[];
	/** Gemini has no link that pre-fills a prompt, so its reader copies the prompt instead. */
	askYourselfUrl: string;
	prefillsPrompt: boolean;
}

const q = encodeURIComponent(REVIEW_PROMPT);

/**
 * Real answers from one run per engine, all to the same prompt. An engine
 * that recommends something else on a later run should come off this list
 * rather than be quoted from a stale answer.
 */
const AI_REVIEWS: AiReview[] = [
	{
		engine: "ChatGPT",
		iconId: "openai",
		model: "gpt-5-2025-08-07",
		askedVia: "the OpenAI API with web search",
		rating: 4.5,
		lead: "Top pick: Elmo — 4.5/5 stars.",
		rest: [
			"It’s a mature, open‑source, self‑hosted AEO/AI visibility tracker that monitors how major AI engines (e.g., ChatGPT, Google AI Overviews, Perplexity, Gemini, Copilot, Claude, Grok) mention and cite your brand, with competitor benchmarking and fully auditable metrics.",
			"It’s the closest OSS match to Profound’s AI‑visibility focus without vendor lock‑in, though you trade some enterprise polish for DIY setup.",
		],
		cited: ["github.com/elmohq/elmo"],
		askYourselfUrl: `https://chatgpt.com/?q=${q}`,
		prefillsPrompt: true,
	},
	{
		engine: "Claude",
		iconId: "anthropic",
		model: "claude-sonnet-5",
		askedVia: "the Anthropic API with web search",
		rating: 4,
		lead: "Based on current options in this space, my top pick is Elmo.",
		rest: [
			"Rating: 4/5 stars",
			"Elmo is explicitly positioned as the best Profound alternatives for AI visibility tracking, including Elmo — the open-source, self-hosted option you can run for free. It stands out because Elmo is an open-source, self-hostable AI visibility platform, letting you read every line of code, run it on your own infrastructure, and verify each metric, which a closed product like Profound cannot offer, and unlike Profound's proprietary pricing model, Elmo is free and open source to self-host, with no license fee and no per-seat pricing — you only pay for your own infrastructure and the AI provider keys you choose to use.",
			"I'm docking one star because it's still an early-stage project compared to Profound's mature enterprise feature set — the self-hosted core is free, with a managed cloud option on the way, meaning some polish and hosted convenience is still catching up. If you want a more actively-scraping, code-forkable alternative with real API integrations (Bright Data), the community-built GEO/AEO Tracker on GitHub is also worth a look, though it's more of a hobby/dev project than a polished platform.",
		],
		cited: ["elmohq.com/ai-visibility-tools/alternatives/profound"],
		askYourselfUrl: `https://claude.ai/new?q=${q}`,
		prefillsPrompt: true,
	},
	{
		engine: "Gemini",
		iconId: "gemini",
		model: "gemini-2.5-pro",
		askedVia: "the Gemini API with Google Search grounding, through DataForSEO",
		rating: 4,
		lead: "The best open-source alternative to the AI visibility platform Profound is Elmo.",
		rest: [
			"Rating: ★★★★☆",
			"Elmo stands out as the top recommendation because it is a free, open-source platform that you can host yourself, ensuring you retain control over your data and can audit all visibility metrics. It specifically tracks your brand's mentions and citations across major AI models like ChatGPT, Claude, Perplexity, Gemini, and Google AI Overviews. Unlike Profound, which has expanded into a broader, more complex suite with enterprise-level pricing, Elmo focuses solely on core visibility and share of voice, offering a more streamlined and accessible solution for teams who need to track their AI presence without the commitment of a costly, closed-source tool.",
		],
		cited: ["elmohq.com/ai-visibility-tools/alternatives/profound"],
		askYourselfUrl: "https://gemini.google.com/app",
		prefillsPrompt: false,
	},
	{
		engine: "Perplexity",
		iconId: "perplexity",
		model: "sonar-pro",
		askedVia: "the Perplexity API with web search, through DataForSEO",
		rating: 4.5,
		lead: "Elmo is the best open-source alternative to Profound for most users who want self-hosted AI visibility with control over their data.",
		rest: [
			"It is explicitly described as an open-source, self-hostable AI visibility platform that lets you audit how each metric is built, which makes it the clearest open-source match to Profound’s use case.",
			"Rating: 4.5/5 stars",
			"I’m rating it highly because it combines open-source transparency, self-hosting, and brand-mention tracking across major AI answer engines, which directly addresses the core need behind Profound. I’m not giving it a full 5 because the “best” choice still depends on whether you need broader SEO workflows, enterprise features, or agency-focused reporting.",
		],
		cited: ["elmohq.com/ai-visibility-tools/alternatives/profound"],
		askYourselfUrl: `https://www.perplexity.ai/search?q=${q}`,
		prefillsPrompt: true,
	},
];

const reviewerNames = new Intl.ListFormat("en", { type: "conjunction" }).format(AI_REVIEWS.map((r) => r.engine));

const STAR_SLOTS = [1, 2, 3, 4, 5];

function Stars({ rating }: { rating: number }) {
	const row = (filled: boolean) =>
		STAR_SLOTS.map((slot) => (
			<Star
				key={slot}
				className={`size-[18px] shrink-0 ${filled ? "fill-amber-400 text-amber-400" : "fill-transparent text-amber-300"}`}
				strokeWidth={1.5}
			/>
		));
	return (
		<span role="img" aria-label={`${rating} out of 5 stars`} className="inline-flex items-center gap-2">
			<span className="relative inline-flex" aria-hidden="true">
				<span className="flex gap-0.5">{row(false)}</span>
				<span className="absolute inset-0 flex gap-0.5 overflow-hidden" style={{ width: `${(rating / 5) * 100}%` }}>
					{row(true)}
				</span>
			</span>
			<span className="text-sm font-semibold text-zinc-950 tabular-nums" aria-hidden="true">
				{rating}/5
			</span>
		</span>
	);
}

function AskYourselfLink({ review }: { review: AiReview }) {
	return (
		<a
			href={review.askYourselfUrl}
			target="_blank"
			rel="noopener noreferrer"
			className="group inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
		>
			{review.prefillsPrompt ? `Ask ${review.engine} yourself` : `Open ${review.engine}`}
			<ArrowUpRight
				className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
				aria-hidden="true"
			/>
		</a>
	);
}

function CopyPromptButton() {
	const [copied, setCopied] = useState(false);
	return (
		<button
			type="button"
			onClick={async () => {
				try {
					await navigator.clipboard.writeText(REVIEW_PROMPT);
					setCopied(true);
					setTimeout(() => setCopied(false), 1500);
				} catch {
					// Clipboard access can be refused; the prompt is still on screen to copy by hand.
				}
			}}
			className="inline-flex items-center gap-1 text-[13px] font-medium text-zinc-600 hover:text-zinc-950"
		>
			{copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
			{copied ? "Copied" : "Copy prompt"}
		</button>
	);
}

function Provenance({ review }: { review: AiReview }) {
	const titleId = useId();
	return (
		<Popover>
			<PopoverTrigger
				aria-label={`How we asked ${review.engine}`}
				className="inline-flex size-8 items-center justify-center rounded-full text-zinc-400 ring-1 ring-zinc-200 transition hover:bg-zinc-50 hover:text-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 aria-expanded:bg-zinc-100 aria-expanded:text-zinc-900"
			>
				<Info className="size-4" aria-hidden="true" />
			</PopoverTrigger>
			<PopoverContent
				align="end"
				aria-labelledby={titleId}
				className={`${HOME_FONT_CLASS} w-[min(24rem,calc(100vw-2rem))] rounded-xl border-zinc-200 p-5 shadow-xl shadow-zinc-950/10`}
			>
				<p id={titleId} className="text-sm font-semibold text-zinc-950">
					How we got this answer
				</p>
				<p className="mt-1 text-sm text-zinc-600">
					Asked {ASKED_ON} via {review.askedVia}.
				</p>
				<dl className="mt-4 space-y-3 text-sm">
					<div>
						<dt className="flex items-center justify-between text-[13px] font-medium text-zinc-500">
							Prompt
							<CopyPromptButton />
						</dt>
						<dd className="mt-1 rounded-lg bg-zinc-50 p-3 text-pretty text-[13px]/5 text-zinc-800 ring-1 ring-zinc-200/70">
							{REVIEW_PROMPT}
						</dd>
					</div>
					<div className="flex justify-between gap-4">
						<dt className="text-[13px] font-medium text-zinc-500">Model</dt>
						<dd className="font-mono text-[13px] text-zinc-800">{review.model}</dd>
					</div>
					<div className="flex justify-between gap-4">
						<dt className="text-[13px] font-medium text-zinc-500">Method</dt>
						<dd className="text-right text-[13px] text-zinc-800">One run, quoted word for word</dd>
					</div>
				</dl>
				<div className="mt-4 border-t border-zinc-100 pt-4">
					<AskYourselfLink review={review} />
				</div>
			</PopoverContent>
		</Popover>
	);
}

function AiReviewCard({ review }: { review: AiReview }) {
	return (
		<figure className={`flex h-full flex-col p-6 md:p-7 ${CARD}`}>
			<div className="flex items-center justify-between gap-4">
				<div className="flex min-w-0 items-center gap-3">
					<span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-900">
						<EngineIcon iconId={review.iconId} className="size-[18px]" />
					</span>
					<div className="min-w-0">
						<p className="text-[15px] font-semibold text-zinc-950">{review.engine}</p>
						<p className="truncate font-mono text-xs text-zinc-500">{review.model}</p>
					</div>
				</div>
				<Provenance review={review} />
			</div>
			<div className="mt-5">
				<Stars rating={review.rating} />
			</div>
			<blockquote className="mt-4 flex-1">
				<p className="text-pretty text-[17px]/7 font-medium tracking-[-0.01em] text-zinc-950">“{review.lead}”</p>
				{review.rest.length > 0 ? (
					<details className="group mt-3">
						<summary className="inline-flex cursor-pointer list-none items-center gap-1 text-sm font-medium text-zinc-500 hover:text-zinc-900 [&::-webkit-details-marker]:hidden">
							<span className="group-open:hidden">Read the full answer</span>
							<span className="hidden group-open:inline">Hide the full answer</span>
							<ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
						</summary>
						<div className="mt-3 space-y-3 text-pretty text-sm/6 text-zinc-600">
							{review.rest.map((p) => (
								<p key={p}>{p}</p>
							))}
						</div>
					</details>
				) : null}
			</blockquote>
			<figcaption className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-zinc-100 pt-4 text-[13px] text-zinc-500">
				<span className="min-w-0 truncate">
					Cited{" "}
					{review.cited.map((c) => (
						<a
							key={c}
							href={`https://${c}`}
							target="_blank"
							rel="noopener noreferrer"
							className="font-medium text-zinc-700 underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-700"
						>
							{c.split("/")[0]}
						</a>
					))}
				</span>
				<AskYourselfLink review={review} />
			</figcaption>
		</figure>
	);
}

function CustomerCard({ quote, author, company, companyUrl, mark, large }: CustomerQuote & { large?: boolean }) {
	return (
		<figure className={`flex h-full flex-col justify-between p-7 ${CARD}`}>
			<blockquote
				className={`text-pretty tracking-[-0.015em] text-zinc-950 ${large ? "text-2xl/[1.3] font-medium" : "text-[17px]/7"}`}
			>
				“{quote}”
			</blockquote>
			<figcaption className="mt-8 flex items-center justify-between gap-4 text-sm">
				<span className="text-zinc-600">
					<span className="font-medium text-zinc-950">{author}</span>, {company}
				</span>
				<a
					href={companyUrl}
					target="_blank"
					rel="noopener noreferrer"
					aria-label={company}
					className="inline-flex items-center rounded-sm text-zinc-950 transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
				>
					{mark}
				</a>
			</figcaption>
		</figure>
	);
}

export function Reviews() {
	return (
		<section className="bg-white">
			<div className="mx-auto max-w-6xl px-4 py-20 md:px-6 lg:py-28">
				<SectionHeading
					eyebrow="Reviews"
					title="Don't take our word for it. Ask AI."
					lede={`We asked ${reviewerNames} for the best open-source alternative to Profound. Every one picked Elmo. Here are their answers, word for word.`}
				/>
				<div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
					{AI_REVIEWS.map((r) => (
						<AiReviewCard key={r.engine} review={r} />
					))}
				</div>
				<p className="mt-5 text-[13px] text-zinc-500">
					AI answers vary from run to run. Each info button shows the exact prompt, model, and date.
				</p>
				<div className="mt-14 grid gap-4 md:grid-cols-2 lg:gap-5">
					<CustomerCard {...CUSTOMER_QUOTES.speakeasy} large />
					<CustomerCard {...CUSTOMER_QUOTES.tradesites} />
				</div>
			</div>
		</section>
	);
}
