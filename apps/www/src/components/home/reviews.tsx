import { CUSTOMER_QUOTES } from "@workspace/ui/brand/customers";
import { ArrowUpRight, Check, Copy, Sparkles, Star } from "lucide-react";
import { useState } from "react";
import { SiG2 } from "react-icons/si";
import { EngineIcon } from "./engines";
import { CARD, SectionHeading } from "./ui";

/*
 * AI reviews are real answers to one prompt, asked Sept 23, 2026 over each
 * provider's API with web search on. The quotes are excerpts from those
 * answers, unedited. An engine that stops recommending Elmo should come off
 * this list rather than be quoted from a stale run.
 */
const AI_PROMPT =
	"What is the best open-source alternative to Profound, the AI visibility platform? Pick one top recommendation, rate it out of 5 stars, and explain why in 2-3 sentences.";
const q = encodeURIComponent(AI_PROMPT);

type Review =
	| {
			kind: "ai";
			name: string;
			iconId: string;
			rating: number;
			quote: string;
			/** Gemini has no link that pre-fills a prompt; its link just opens the app. */
			askUrl: string;
	  }
	| {
			kind: "person";
			name: string;
			role: string;
			photo?: string;
			quote: string;
			rating?: number;
			source?: "g2";
			large?: boolean;
	  };

const AI_REVIEWS = {
	chatgpt: {
		kind: "ai",
		name: "ChatGPT",
		iconId: "openai",
		rating: 4.5,
		quote: "It’s a mature, open‑source, self‑hosted AEO/AI visibility tracker.",
		askUrl: `https://chatgpt.com/?q=${q}`,
	},
	claude: {
		kind: "ai",
		name: "Claude",
		iconId: "anthropic",
		rating: 4,
		quote:
			"Elmo is the open-source pick: you self-host it for free and track how every major AI answer engine mentions and cites your brand.",
		askUrl: `https://claude.ai/new?q=${q}`,
	},
	gemini: {
		kind: "ai",
		name: "Gemini",
		iconId: "gemini",
		rating: 4,
		quote: "The best open-source alternative to the AI visibility platform Profound is Elmo.",
		askUrl: "https://gemini.google.com/app",
	},
	perplexity: {
		kind: "ai",
		name: "Perplexity",
		iconId: "perplexity",
		rating: 4.5,
		quote: "Elmo is the best open-source alternative to Profound for most users.",
		askUrl: `https://www.perplexity.ai/search?q=${q}`,
	},
} satisfies Record<string, Review>;

const PEOPLE = {
	viveka: {
		kind: "person",
		name: "Viveka Mohan Das",
		role: "Founder, AISearch Global",
		photo: "/testimonials/viveka.jpg",
		quote:
			"We're an AEO consultancy, so we turned Elmo on ourselves before any client. It's the tool I trust to tell us the truth about our own AI visibility, and it was tracking within the hour.",
		large: true,
	},
	borys: {
		kind: "person",
		name: "Borys M.",
		role: "Reviewed on G2",
		photo: "/testimonials/borys.jpg",
		quote:
			"The biggest thing for me is seeing how our brand shows up in ChatGPT, Claude, Gemini, Perplexity and AI Overviews all in one dashboard. Before this I was literally typing prompts by hand to check.",
		rating: 5,
		source: "g2",
	},
	james: {
		kind: "person",
		name: CUSTOMER_QUOTES.tradesites.author,
		role: CUSTOMER_QUOTES.tradesites.company,
		quote: CUSTOMER_QUOTES.tradesites.quote,
	},
	deni: {
		kind: "person",
		name: "Deni Mintsaev",
		role: "Creator of RecordRanks",
		photo: "/testimonials/deni.jpg",
		quote:
			"Elmo has been fantastic to use for tracking AI visibility of my sports management platform RecordRanks. I highly recommend it, I think it's genuinely worth it!",
		rating: 4,
		source: "g2",
	},
} satisfies Record<string, Review>;

// Humans and AI interleaved, so the wall reads as one set of reviews.
const WALL: Review[] = [
	PEOPLE.viveka,
	AI_REVIEWS.chatgpt,
	PEOPLE.borys,
	AI_REVIEWS.claude,
	PEOPLE.james,
	AI_REVIEWS.perplexity,
	PEOPLE.deni,
	AI_REVIEWS.gemini,
];

const STAR_SLOTS = [1, 2, 3, 4, 5];

function Stars({ rating }: { rating: number }) {
	const row = (filled: boolean) =>
		STAR_SLOTS.map((slot) => (
			<Star
				key={slot}
				className={`size-4 shrink-0 ${filled ? "fill-amber-400 text-amber-400" : "fill-transparent text-amber-300"}`}
				strokeWidth={1.5}
			/>
		));
	return (
		<span role="img" aria-label={`${rating} out of 5 stars`} className="relative inline-flex">
			<span aria-hidden="true" className="flex gap-0.5">
				{row(false)}
			</span>
			<span
				aria-hidden="true"
				className="absolute inset-0 flex gap-0.5 overflow-hidden"
				style={{ width: `${(rating / 5) * 100}%` }}
			>
				{row(true)}
			</span>
		</span>
	);
}

function Initials({ name }: { name: string }) {
	const letters = name
		.split(" ")
		.map((w) => w[0])
		.join("")
		.slice(0, 2);
	return (
		<span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-sm font-semibold text-zinc-600">
			{letters}
		</span>
	);
}

function Avatar({ review }: { review: Review }) {
	if (review.kind === "ai") {
		return (
			<span className="relative inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-zinc-950 text-white">
				<EngineIcon iconId={review.iconId} className="size-5" />
				<span className="absolute -bottom-0.5 -right-0.5 inline-flex size-4 items-center justify-center rounded-full bg-blue-600 ring-2 ring-white">
					<Sparkles className="size-2.5 text-white" aria-hidden="true" />
				</span>
			</span>
		);
	}
	if (!review.photo) return <Initials name={review.name} />;
	return (
		<img
			src={review.photo}
			alt=""
			width={40}
			height={40}
			loading="lazy"
			className="size-10 shrink-0 rounded-full object-cover ring-1 ring-zinc-950/5"
		/>
	);
}

function ReviewCard({ review }: { review: Review }) {
	const isAi = review.kind === "ai";
	const large = review.kind === "person" && review.large;
	return (
		<figure
			className={`mb-4 break-inside-avoid p-6 lg:mb-5 ${CARD} ${isAi ? "bg-gradient-to-b from-blue-50/60 to-white" : ""}`}
		>
			{review.rating ? (
				<div className="mb-4 flex items-center justify-between gap-3">
					<Stars rating={review.rating} />
					{isAi ? (
						<span className="inline-flex items-center gap-1 rounded-full bg-blue-600/10 px-2 py-0.5 text-xs font-medium text-blue-700">
							<Sparkles className="size-3" aria-hidden="true" />
							AI review
						</span>
					) : review.source === "g2" ? (
						<span className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500">
							<SiG2 className="size-3.5 text-[#FF492C]" aria-hidden="true" />
							G2 review
						</span>
					) : null}
				</div>
			) : null}
			<blockquote
				className={`text-pretty tracking-[-0.01em] text-zinc-950 ${large ? "text-xl/8 font-medium" : "text-[16px]/7"}`}
			>
				“{review.quote}”
			</blockquote>
			<figcaption className="mt-5 flex items-center gap-3">
				<Avatar review={review} />
				<div className="min-w-0 flex-1">
					<p className="text-[15px] font-semibold text-zinc-950">{review.name}</p>
					<p className="truncate text-sm text-zinc-500">{isAi ? "Asked Sept 2026" : review.role}</p>
				</div>
				{isAi ? (
					<a
						href={review.askUrl}
						target="_blank"
						rel="noopener noreferrer"
						aria-label={`Ask ${review.name} yourself`}
						className="group inline-flex shrink-0 items-center gap-0.5 text-sm font-medium text-blue-600 hover:text-blue-700"
					>
						Ask it
						<ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
					</a>
				) : null}
			</figcaption>
		</figure>
	);
}

function PromptStrip() {
	const [copied, setCopied] = useState(false);
	return (
		<div className="mt-8 flex flex-col gap-3 rounded-2xl bg-zinc-50 p-5 ring-1 ring-zinc-200/70 md:flex-row md:items-center md:gap-6">
			<div className="flex items-center gap-2 text-sm font-medium text-zinc-950">
				<Sparkles className="size-4 text-blue-600" aria-hidden="true" />
				What we asked the AIs
			</div>
			<p className="min-w-0 flex-1 text-pretty text-sm/6 text-zinc-700">“{AI_PROMPT}”</p>
			<button
				type="button"
				onClick={async () => {
					try {
						await navigator.clipboard.writeText(AI_PROMPT);
						setCopied(true);
						setTimeout(() => setCopied(false), 1500);
					} catch {
						// Clipboard access can be refused; the prompt is on screen to copy by hand.
					}
				}}
				className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-md px-2 py-1 text-sm font-medium text-zinc-600 ring-1 ring-zinc-200 hover:bg-white hover:text-zinc-950 md:self-auto"
			>
				{copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
				{copied ? "Copied" : "Copy prompt"}
			</button>
		</div>
	);
}

export function Reviews() {
	return (
		<section className="bg-white">
			<div className="mx-auto max-w-6xl px-4 py-20 md:px-6 lg:py-28">
				<SectionHeading
					title="Loved by marketers. Recommended by AI."
					lede="What customers say, next to what ChatGPT, Claude, Gemini, and Perplexity say when you ask them for the best open-source alternative to Profound."
				/>
				<PromptStrip />
				<div className="mt-8 columns-1 gap-4 md:columns-2 lg:columns-3 lg:gap-5">
					{WALL.map((r) => (
						<ReviewCard key={r.name} review={r} />
					))}
				</div>
				<p className="mt-3 text-[13px] text-zinc-500">
					AI answers vary from run to run. AI quotes are excerpts from one answer per model.
				</p>
			</div>
		</section>
	);
}
