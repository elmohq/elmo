/**
 * Shared data model for the self-hosted repo-activity SVG (a branded,
 * bot-filtered replacement for the Repobeats embed). The fetch layer
 * (`github.ts`) produces a `RepobeatsData`; the renderers (`svg/*`) consume it.
 * Nothing here imports server-only modules so the sample generator can reuse it.
 */

/** A single ISO-week bucket. `week` is the unix timestamp (seconds) of the week start. */
export interface WeekPoint {
	week: number;
	total: number;
}

/** Weekly line-of-code churn. `additions` is positive, `deletions` negative (GitHub convention). */
export interface ChurnPoint {
	week: number;
	additions: number;
	deletions: number;
}

export interface RepoContributor {
	login: string;
	htmlUrl: string;
	contributions: number;
	/** Small avatar inlined as a `data:` URI (null if it could not be fetched). */
	avatarDataUri: string | null;
}

/** One segment of the area-label distribution bar. */
export interface LabelSlice {
	key: string;
	label: string;
	count: number;
	color: string;
}

export interface ReleaseInfo {
	tag: string;
	date: string;
	prerelease: boolean;
}

export interface RepobeatsData {
	repo: string;
	/** ISO timestamp the snapshot was assembled. */
	generatedAt: string;
	/** Rolling window (days) the KPIs are measured over. */
	windowDays: number;

	stars: number;
	forks: number;
	description: string | null;
	createdAt: string;
	pushedAt: string;

	/** Weekly commit totals, oldest → newest (up to 52 weeks). */
	commitsByWeek: WeekPoint[];
	/** Weekly additions/deletions, oldest → newest. Empty when GitHub is still computing stats. */
	churnByWeek: ChurnPoint[];
	/** Unix week-start timestamps that contained at least one release (for chart markers). */
	releaseWeeks: number[];

	/** Rolling-window activity counters. */
	kpis: {
		commits: number;
		prsMerged: number;
		prsOpened: number;
		issuesClosed: number;
		issuesOpened: number;
		releases: number;
		contributors: number;
	};

	/** All-time totals. */
	totals: {
		issuesOpen: number;
		issuesClosed: number;
		releases: number;
	};

	latestRelease: ReleaseInfo | null;

	/** Human contributors only (bots filtered), sorted by contributions desc. */
	contributors: RepoContributor[];
	/** Count of human contributors (may exceed `contributors.length`, which is capped for avatars). */
	contributorTotal: number;

	/** area/* label distribution across issues, sorted by count desc. */
	areaLabels: LabelSlice[];
}
