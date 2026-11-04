import { ArrowRight } from "lucide-react";
import type { FeatureGraphicKey, ProductFeature } from "@/data/features";
import {
	ApiGraphic,
	CitationsPageGraphic,
	EnginesGraphic,
	OpportunitiesPageGraphic,
	OverviewPageGraphic,
	PromptSettingsGraphic,
	QueryFanOutPageGraphic,
	ResponsesGraphic,
	SentimentPageGraphic,
	ShareOfVoicePageGraphic,
	VisibilityPageGraphic,
	VisibilityTrendGraphic,
} from "./feature-graphics";

const GRAPHICS: Record<FeatureGraphicKey, () => React.ReactNode> = {
	overview: OverviewPageGraphic,
	visibility: VisibilityPageGraphic,
	"share-of-voice": ShareOfVoicePageGraphic,
	sentiment: SentimentPageGraphic,
	citations: CitationsPageGraphic,
	"query-fan-out": QueryFanOutPageGraphic,
	prompts: PromptSettingsGraphic,
	responses: ResponsesGraphic,
	opportunities: OpportunitiesPageGraphic,
	trend: VisibilityTrendGraphic,
	api: ApiGraphic,
	engines: EnginesGraphic,
};

export function FeatureGraphic({ graphic }: { graphic: FeatureGraphicKey }) {
	const Graphic = GRAPHICS[graphic];
	return <Graphic />;
}

export function featurePath(slug: string) {
	return `/features/${slug}`;
}

/** "Share of voice" reads as "share of voice" mid-sentence; names led by an acronym ("AI", "API") stay as they are. */
function midSentence(name: string) {
	return /^[A-Z][a-z]/.test(name) ? name.charAt(0).toLowerCase() + name.slice(1) : name;
}

/** A feature as a linked card: its visual on top, name and summary below. */
export function FeatureCard({ feature }: { feature: ProductFeature }) {
	return (
		<a
			href={featurePath(feature.slug)}
			className="group flex w-full flex-col rounded-md border border-zinc-200 bg-white p-3 transition-colors hover:border-zinc-300"
		>
			<FeatureGraphic graphic={feature.graphic} />
			<div className="flex flex-1 flex-col px-2 pb-2 pt-5">
				<h2 className="text-xl font-semibold tracking-tight text-zinc-950">{feature.name}</h2>
				<p className="mt-2 flex-1 text-pretty text-[15px]/6 text-zinc-600">{feature.summary}</p>
				<span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-blue-600 group-hover:text-blue-700">
					Explore {midSentence(feature.name)}
					<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
				</span>
			</div>
		</a>
	);
}
