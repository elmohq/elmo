import { ModelIcon } from "@workspace/ui/brand/model-icon";
import { DISPLAY, Shot } from "./ui";

function GeminiIcon({ className }: { className?: string }) {
	return (
		<svg aria-hidden="true" viewBox="0 0 24 24" className={`fill-current ${className}`}>
			<path d="M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81" />
		</svg>
	);
}

const MODELS: { name: string; icon: (cls: string) => React.ReactNode }[] = [
	{ name: "ChatGPT", icon: (c) => <ModelIcon iconId="openai" className={c} /> },
	{ name: "Claude", icon: (c) => <ModelIcon iconId="anthropic" className={c} /> },
	{ name: "Gemini", icon: (c) => <GeminiIcon className={c} /> },
	{ name: "Google AI Overviews", icon: (c) => <ModelIcon iconId="google" className={c} /> },
	{ name: "Google AI Mode", icon: (c) => <ModelIcon iconId="google" className={c} /> },
	{ name: "Perplexity", icon: (c) => <ModelIcon iconId="perplexity" className={c} /> },
	{ name: "Copilot", icon: (c) => <ModelIcon iconId="microsoft" className={c} /> },
	{ name: "Grok", icon: (c) => <ModelIcon iconId="x" className={c} /> },
	{ name: "DeepSeek", icon: (c) => <ModelIcon iconId="deepseek" className={c} /> },
	{ name: "Mistral", icon: (c) => <ModelIcon iconId="mistral" className={c} /> },
];

function ModelRow({ duplicate = false }: { duplicate?: boolean }) {
	return (
		<ul
			aria-hidden={duplicate || undefined}
			className={`flex shrink-0 items-center gap-3 pr-3 ${duplicate ? "hb-marquee-dup" : ""}`}
		>
			{MODELS.map((m) => (
				<li
					key={m.name}
					className="inline-flex shrink-0 items-center gap-2.5 rounded-2xl bg-white/10 px-5 py-3.5 text-base font-semibold whitespace-nowrap text-white ring-1 ring-white/20"
				>
					{m.icon("size-5 shrink-0")}
					{m.name}
				</li>
			))}
		</ul>
	);
}

/**
 * The product screenshot straddles the page background and the blue band, so
 * the hero hands off to the model list without a hard edge.
 */
export function ModelsBand() {
	return (
		<section aria-labelledby="hb-models" className="relative">
			<div aria-hidden="true" className="absolute inset-x-0 top-[38%] bottom-0 bg-blue-600 sm:top-1/2" />
			<div className="relative mx-auto max-w-6xl px-5 md:px-8">
				<div className="overflow-hidden rounded-2xl bg-white shadow-[0_30px_80px_-20px_rgb(9_9_11/0.35)] ring-1 ring-zinc-950/10 sm:rounded-3xl">
					<div className="flex items-center gap-1.5 border-b border-zinc-100 bg-zinc-50 px-4 py-3" aria-hidden="true">
						<span className="size-3 rounded-full bg-rose-400" />
						<span className="size-3 rounded-full bg-amber-400" />
						<span className="size-3 rounded-full bg-emerald-400" />
						<span className="ml-3 hidden rounded-md bg-white px-3 py-1 text-xs text-zinc-500 ring-1 ring-zinc-200 sm:block">
							demo.elmohq.com
						</span>
					</div>
					<Shot
						src="/screenshots/overview.png"
						alt="Elmo overview dashboard showing a 71% AI visibility score, 14% share of voice, and 30-day trend charts for a demo brand"
						sizes="(min-width: 1152px) 1100px, 100vw"
						eager
					/>
				</div>
			</div>

			<div className="relative bg-blue-600 pt-20 pb-20 text-white lg:pt-24 lg:pb-24">
				<div className="mx-auto max-w-6xl px-5 text-center md:px-8">
					<h2 id="hb-models" className={`${DISPLAY} text-4xl leading-[1.05] md:text-6xl`}>
						Every AI model your customers ask.
					</h2>
					<p className="mx-auto mt-5 max-w-[40rem] text-pretty text-lg text-blue-100">
						See what ChatGPT users actually see via web scraping, or track responses through each model's API or
						OpenRouter. Bring your own keys.
					</p>
				</div>
				<div className="hb-marquee mt-12 flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
					<div className="hb-marquee-track flex">
						<ModelRow />
						<ModelRow duplicate />
					</div>
				</div>
				<p className="mt-8 text-center text-sm font-semibold text-blue-100">…and all the rest.</p>
			</div>
		</section>
	);
}
