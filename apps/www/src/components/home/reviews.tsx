import { CUSTOMER_QUOTES } from "@workspace/ui/brand/customers";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { EngineIcon } from "./engines";
import { HOME_FONT_CLASS } from "./styles";
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
			quote: string;
			/** The whole answer, word for word, minus markdown emphasis and citation markers. */
			response: string[];
			/** Gemini has no link that pre-fills a prompt; its link just opens the app. */
			askUrl: string;
	  }
	| {
			kind: "person";
			name: string;
			role?: string;
			photo?: string;
			quote: string;
			large?: boolean;
	  };

const AI_REVIEWS = {
	chatgpt: {
		kind: "ai",
		name: "ChatGPT",
		iconId: "openai",
		quote: "It’s a mature, open‑source, self‑hosted AEO/AI visibility tracker.",
		response: [
			"Top pick: Elmo — 4.5/5 stars. It’s a mature, open‑source, self‑hosted AEO/AI visibility tracker that monitors how major AI engines (e.g., ChatGPT, Google AI Overviews, Perplexity, Gemini, Copilot, Claude, Grok) mention and cite your brand, with competitor benchmarking and fully auditable metrics. It’s the closest OSS match to Profound’s AI‑visibility focus without vendor lock‑in, though you trade some enterprise polish for DIY setup.",
		],
		askUrl: `https://chatgpt.com/?q=${q}`,
	},
	claude: {
		kind: "ai",
		name: "Claude",
		iconId: "anthropic",
		quote:
			"Elmo is the open-source pick: you self-host it for free and track how every major AI answer engine mentions and cites your brand.",
		response: [
			"Top Recommendation: Elmo — ★★★★☆ (4/5)",
			"Why Elmo: Elmo is the open-source pick: you self-host it for free and track how every major AI answer engine mentions and cites your brand. Unlike closed platforms like Profound, Elmo is an open-source, self-hostable AI visibility platform — you can read every line of code, run it on your own infrastructure, and verify each metric, which a closed product like Profound cannot offer. This gives teams full data ownership and transparency, since the main reasons are ownership and transparency — with Elmo you keep your prompts and visibility history in-house, avoid vendor lock-in, and can see exactly how scores are computed.",
			"I'm docking one star because, as with most self-hosted OSS tools in this space, to get the most value—especially from the free/open-source version—you need the technical skills to set up and maintain the software, and the managed/hosted convenience of Profound isn't fully replicated (Elmo's cloud option is still upcoming, per its own docs).",
		],
		askUrl: `https://claude.ai/new?q=${q}`,
	},
	gemini: {
		kind: "ai",
		name: "Gemini",
		iconId: "gemini",
		quote: "The best open-source alternative to the AI visibility platform Profound is Elmo.",
		response: [
			"The best open-source alternative to the AI visibility platform Profound is Elmo.",
			"Rating: ★★★★☆",
			"Elmo stands out as the top recommendation because it is a free, open-source platform that you can host yourself, ensuring you retain control over your data and can audit all visibility metrics. It specifically tracks your brand's mentions and citations across major AI models like ChatGPT, Claude, Perplexity, Gemini, and Google AI Overviews. Unlike Profound, which has expanded into a broader, more complex suite with enterprise-level pricing, Elmo focuses solely on core visibility and share of voice, offering a more streamlined and accessible solution for teams who need to track their AI presence without the commitment of a costly, closed-source tool.",
		],
		askUrl: "https://gemini.google.com/app",
	},
	perplexity: {
		kind: "ai",
		name: "Perplexity",
		iconId: "perplexity",
		quote: "Elmo is the best open-source alternative to Profound for most users.",
		response: [
			"Elmo is the best open-source alternative to Profound for most users who want self-hosted AI visibility with control over their data. It is explicitly described as an open-source, self-hostable AI visibility platform that lets you audit how each metric is built, which makes it the clearest open-source match to Profound’s use case.",
			"Rating: 4.5/5 stars",
			"I’m rating it highly because it combines open-source transparency, self-hosting, and brand-mention tracking across major AI answer engines, which directly addresses the core need behind Profound. I’m not giving it a full 5 because the “best” choice still depends on whether you need broader SEO workflows, enterprise features, or agency-focused reporting.",
		],
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
		photo: "/testimonials/borys.jpg",
		quote:
			"The biggest thing for me is seeing how our brand shows up in ChatGPT, Claude, Gemini, Perplexity and AI Overviews all in one dashboard. Before this I was literally typing prompts by hand to check.",
	},
	james: {
		kind: "person",
		name: "James W.",
		role: CUSTOMER_QUOTES.tradesites.company,
		photo: "/testimonials/james.jpg",
		quote: CUSTOMER_QUOTES.tradesites.quote,
	},
	deni: {
		kind: "person",
		name: "Deni Mintsaev",
		role: "Creator of RecordRanks",
		photo: "/testimonials/deni.jpg",
		quote:
			"Elmo has been fantastic to use for tracking AI visibility of my sports management platform RecordRanks. I highly recommend it, I think it's genuinely worth it!",
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
			<blockquote
				className={`text-pretty tracking-[-0.01em] text-zinc-950 ${large ? "text-xl/8 font-medium" : "text-[16px]/7"}`}
			>
				“{review.quote}”
			</blockquote>
			<figcaption className="mt-5 flex items-center gap-3">
				<Avatar review={review} />
				<div className="min-w-0 flex-1">
					<p className="text-[15px] font-semibold text-zinc-950">{review.name}</p>
					{review.kind === "ai" ? (
						<AnswerDetails review={review} />
					) : review.role ? (
						<p className="truncate text-sm text-zinc-500">{review.role}</p>
					) : null}
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

type AiReview = Extract<Review, { kind: "ai" }>;

function AnswerDetails({ review }: { review: AiReview }) {
	return (
		<Popover>
			<PopoverTrigger
				openOnHover
				delay={150}
				className="rounded-sm text-sm text-zinc-500 underline decoration-zinc-400 decoration-dotted underline-offset-4 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
			>
				Asked Sept 2026
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className={`${HOME_FONT_CLASS} w-[min(26rem,calc(100vw-2rem))] rounded-xl border-zinc-200 p-5 shadow-xl shadow-zinc-950/10`}
			>
				<p className="text-[13px] font-medium text-zinc-500">We asked {review.name}</p>
				<p className="mt-1.5 rounded-lg bg-zinc-50 p-3 text-pretty text-[13px]/5 text-zinc-800 ring-1 ring-zinc-200/70">
					{AI_PROMPT}
				</p>
				<p className="mt-4 text-[13px] font-medium text-zinc-500">Its full answer, Sept 23, 2026</p>
				<div className="mt-1.5 max-h-44 space-y-2.5 overflow-y-auto overscroll-contain rounded-lg p-3 text-pretty text-sm/6 text-zinc-800 ring-1 ring-zinc-200/70">
					{review.response.map((p) => (
						<p key={p}>{p}</p>
					))}
				</div>
				<p className="mt-4 border-t border-zinc-100 pt-3 text-xs text-zinc-500">
					Asked over the {review.name} API with web search. Answers vary.
				</p>
			</PopoverContent>
		</Popover>
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
				<div className="mt-8 columns-1 gap-4 md:columns-2 lg:columns-3 lg:gap-5">
					{WALL.map((r) => (
						<ReviewCard key={r.name} review={r} />
					))}
				</div>
			</div>
		</section>
	);
}
