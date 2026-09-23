import { CUSTOMER_QUOTES, type CustomerQuote } from "@workspace/ui/brand/customers";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover";
import { ArrowUpRight, Info, Star } from "lucide-react";
import { useId } from "react";
import { EngineIcon } from "./engines";
import { HOME_FONT_CLASS } from "./styles";
import { CARD, SectionHeading } from "./ui";

const REVIEW_PROMPT =
	"What is the best open-source AI visibility tracker (for tracking how brands show up in ChatGPT, Gemini, Perplexity, etc.)? Pick one top recommendation, rate it out of 5 stars, and explain why in 2-3 sentences.";

interface AiReview {
	engine: string;
	iconId: string;
	model: string;
	/** How the question was put, in the words the provenance note uses. */
	askedVia: string;
	askedOn: string;
	prompt: string;
	rating: number;
	/**
	 * The response word for word, split only so the verdict can be set larger than
	 * the caveat. Joined with a space it must equal what the model returned, minus
	 * inline citation links, which are listed in `cited` instead.
	 */
	verdict: string;
	caveat?: string;
	cited: string[];
	askYourselfUrl: string;
}

/**
 * Real answers from real runs, and only from engines that picked Elmo. An
 * engine that recommended something else on the same prompt stays off this
 * list rather than being quoted out of context.
 */
const AI_REVIEWS: AiReview[] = [
	{
		engine: "ChatGPT",
		iconId: "openai",
		model: "gpt-5-2025-08-07",
		askedVia: "the OpenAI API with web search",
		askedOn: "Sept 23, 2026",
		prompt: REVIEW_PROMPT,
		rating: 4.5,
		verdict:
			"Top pick: Elmo — 4.5/5 stars. It’s MIT-licensed and self-hostable, tracks how ChatGPT, Gemini, Perplexity (and more) mention and cite your brand using auditable, code-visible metrics, storing raw outputs and supporting both real UI scraping and model APIs with dashboards and a REST API.",
		caveat:
			"I’m not giving it a perfect score because some advanced features (like built‑in sentiment and prompt volume estimates) are still on the roadmap.",
		cited: ["github.com/elmohq/elmo"],
		askYourselfUrl: `https://chatgpt.com/?q=${encodeURIComponent(REVIEW_PROMPT)}`,
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
			Ask {review.engine} yourself
			<ArrowUpRight
				className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
				aria-hidden="true"
			/>
		</a>
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
					Asked {review.askedOn} via {review.askedVia}.
				</p>
				<dl className="mt-4 space-y-3 text-sm">
					<div>
						<dt className="text-[13px] font-medium text-zinc-500">Prompt</dt>
						<dd className="mt-1 rounded-lg bg-zinc-50 p-3 text-pretty text-[13px]/5 text-zinc-800 ring-1 ring-zinc-200/70">
							{review.prompt}
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
		<figure className={`flex h-full flex-col p-7 md:p-9 ${CARD}`}>
			<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-4">
				<div className="flex items-center gap-3">
					<span className="inline-flex size-10 items-center justify-center rounded-full bg-zinc-950 text-white">
						<EngineIcon iconId={review.iconId} className="size-5" />
					</span>
					<div>
						<p className="text-[15px] font-semibold text-zinc-950">{review.engine}</p>
						<p className="whitespace-nowrap font-mono text-xs text-zinc-500">{review.model}</p>
					</div>
				</div>
				<div className="flex items-center gap-3">
					<Stars rating={review.rating} />
					<Provenance review={review} />
				</div>
			</div>
			<blockquote className="mt-7 flex-1">
				<p className="text-pretty text-lg/[1.55] font-medium tracking-[-0.01em] text-zinc-950 md:text-xl/[1.55]">
					“{review.verdict}
					{review.caveat ? null : "”"}
				</p>
				{review.caveat ? <p className="mt-3 text-pretty text-base/7 text-zinc-500">{review.caveat}”</p> : null}
			</blockquote>
			<figcaption className="mt-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-zinc-100 pt-5 text-sm text-zinc-500">
				<span>
					Cited{" "}
					{review.cited.map((c) => (
						<a
							key={c}
							href={`https://${c}`}
							target="_blank"
							rel="noopener noreferrer"
							className="font-medium text-zinc-700 underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-700"
						>
							{c}
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
					lede={`We asked ${reviewerNames} to pick the best open-source AI visibility tracker. Here's the answer, word for word, next to what customers say.`}
				/>
				<div className="mt-12 grid gap-4 lg:grid-cols-12 lg:gap-5">
					<div className="flex min-w-0 flex-col gap-4 lg:col-span-7 lg:gap-5">
						{AI_REVIEWS.map((r) => (
							<AiReviewCard key={r.engine} review={r} />
						))}
					</div>
					<div className="grid min-w-0 gap-4 lg:col-span-5 lg:gap-5">
						<CustomerCard {...CUSTOMER_QUOTES.speakeasy} large />
						<CustomerCard {...CUSTOMER_QUOTES.tradesites} />
					</div>
				</div>
				<p className="mt-5 text-[13px] text-zinc-500">
					AI answers vary from run to run. The info button shows the exact prompt, model, and date.
				</p>
			</div>
		</section>
	);
}
