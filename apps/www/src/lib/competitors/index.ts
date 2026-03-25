export {
	type FeatureKey,
	type CompetitorCategory,
	type Competitor,
	type FeatureDefinition,
	type FeatureCategory,
	FEATURE_CATEGORIES,
	ALL_FEATURE_KEYS,
	ELMO_FEATURES,
	CATEGORY_LABELS,
	LOW_DR_THRESHOLD,
	isLowDR,
	getFeatureLabel,
	getFeatureDescription,
	getScreenshotUrl,
} from "./types";

export {
	competitors,
	getCompetitorBySlug,
	getComparisonSlug,
	getPopularity,
	formatPopularity,
	getPopularityGrade,
} from "./data";
