import type { FeatureKey } from "@/lib/competitors";
import type { FaqItem } from "@/lib/faqs";
import alternativesGuides from "./alternatives.json";
import featureGuides from "./features.json";
import hubGuide from "./hub.json";

export interface GuideSection {
	heading: string;
	paragraphs: string[];
	items?: { title: string; body: string }[];
	table?: { columns: string[]; rows: string[][] };
}

export interface DirectoryGuide {
	metaTitle: string;
	metaDescription: string;
	title: string;
	lead: string;
	elmoPitch?: string;
	picksTitle?: string;
	picks?: { slug: string; reason: string }[];
	sections: GuideSection[];
	listTitle?: string;
	faqs: FaqItem[];
}

const features = featureGuides as Partial<Record<FeatureKey, DirectoryGuide>>;
const alternatives = alternativesGuides as Partial<Record<string, DirectoryGuide>>;

export function getFeatureGuide(key: FeatureKey): DirectoryGuide | undefined {
	return features[key];
}

export function getAlternativesGuide(slug: string): DirectoryGuide | undefined {
	return alternatives[slug];
}

export const HUB_GUIDE = hubGuide as DirectoryGuide;
