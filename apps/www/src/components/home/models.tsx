import { EngineIcon } from "./engines";
import { SectionHeading } from "./ui";

const ENGINES = [
	{ name: "ChatGPT", iconId: "openai" },
	{ name: "Claude", iconId: "anthropic" },
	{ name: "Gemini", iconId: "gemini" },
	{ name: "Perplexity", iconId: "perplexity" },
	{ name: "Google AI Overviews", iconId: "google" },
	{ name: "Google AI Mode", iconId: "google" },
	{ name: "Copilot", iconId: "microsoft" },
	{ name: "Grok", iconId: "x" },
	{ name: "DeepSeek", iconId: "deepseek" },
	{ name: "Mistral", iconId: "mistral" },
	{ name: "Qwen", iconId: "qwen" },
];

function Chip({ name, iconId }: { name: string; iconId: string }) {
	return (
		<li className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-[15px] font-medium text-zinc-900 shadow-[0_0_0_1px_rgb(24_24_27/0.1)]">
			<EngineIcon iconId={iconId} className="size-4 shrink-0" />
			{name}
		</li>
	);
}

export function ModelCoverage() {
	return (
		<section className="border-t border-zinc-200/80 bg-zinc-50/70">
			<div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:px-6 lg:grid-cols-12 lg:items-center lg:gap-12 lg:py-20">
				<div className="lg:col-span-5">
					<SectionHeading
						title="Every answer engine your buyers use."
						lede="Elmo reads what real users see in ChatGPT, Perplexity, and Google's AI results, and calls the rest through their APIs or OpenRouter."
					/>
				</div>
				<div className="lg:col-span-7">
					<ul className="flex flex-wrap gap-2.5" aria-label="AI engines Elmo tracks">
						{ENGINES.map((m) => (
							<Chip key={m.name} {...m} />
						))}
					</ul>
					<p className="mt-4 text-sm text-zinc-500">Plus any other model on OpenRouter when you self-host.</p>
				</div>
			</div>
		</section>
	);
}
