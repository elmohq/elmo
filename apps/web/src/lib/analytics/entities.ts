/** The brand-level rows the analytics read alongside its rollups. */
export interface AnalyticsBrandRow {
	id: string;
	name: string;
	website: string;
	additionalDomains: string[];
	delayOverrideHours: number | null;
}

export interface AnalyticsCompetitorRow {
	id: string;
	name: string;
	domains: string[];
}

export interface AnalyticsPromptRow {
	id: string;
	value: string;
	tags: string[];
	systemTags: string[];
	enabled: boolean;
	createdAt: Date;
}
