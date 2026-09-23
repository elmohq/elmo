import { EngineIcon } from "./engines";
import { SectionHeading } from "./ui";

// Google's surfaces lead: AI Overviews reaches more searchers than any chatbot.
const GOOGLE = [
	{ name: "Google AI Overviews", iconId: "google" },
	{ name: "Google AI Mode", iconId: "google" },
	{ name: "Gemini", iconId: "gemini" },
];

const OTHERS = [
	{ name: "ChatGPT", iconId: "openai" },
	{ name: "Perplexity", iconId: "perplexity" },
	{ name: "Claude", iconId: "anthropic" },
	{ name: "Copilot", iconId: "microsoft" },
	{ name: "Grok", iconId: "x" },
	{ name: "DeepSeek", iconId: "deepseek" },
	{ name: "Mistral", iconId: "mistral" },
	{ name: "Qwen", iconId: "qwen" },
];

function Chip({ name, iconId, strong = false }: { name: string; iconId: string; strong?: boolean }) {
	return (
		<li
			className={`inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-[15px] font-medium text-zinc-900 ${
				strong
					? "shadow-[0_0_0_1px_rgb(37_99_235/0.35),0_4px_12px_-6px_rgb(37_99_235/0.35)]"
					: "shadow-[0_0_0_1px_rgb(24_24_27/0.1)]"
			}`}
		>
			<EngineIcon iconId={iconId} className="size-4 shrink-0" />
			{name}
		</li>
	);
}

export function ModelCoverage() {
	return (
		<section className="border-y border-zinc-200/80 bg-zinc-50/70">
			<div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:px-6 lg:grid-cols-12 lg:items-center lg:gap-12 lg:py-20">
				<div className="lg:col-span-5">
					<SectionHeading
						eyebrow="Coverage"
						title="Every answer engine your buyers use."
						lede="Elmo reads what real users see in Google's AI results, ChatGPT, and Perplexity, and calls the rest through their APIs or OpenRouter."
					/>
				</div>
				<div className="lg:col-span-7">
					<ul className="flex flex-wrap gap-2.5" aria-label="Google AI">
						{GOOGLE.map((m) => (
							<Chip key={m.name} {...m} strong />
						))}
					</ul>
					<ul className="mt-2.5 flex flex-wrap gap-2.5" aria-label="Other AI engines">
						{OTHERS.map((m) => (
							<Chip key={m.name} {...m} />
						))}
					</ul>
					<p className="mt-4 text-sm text-zinc-500">Plus any other model on OpenRouter when you self-host.</p>
				</div>
			</div>
		</section>
	);
}
