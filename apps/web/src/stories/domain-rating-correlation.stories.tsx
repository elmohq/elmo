/**
 * Stories for the Citations page "Domain authority vs. citations" section.
 *
 * Renders the presentational <DomainRatingCorrelationView /> across its states:
 *  - Warmed (enough rated domains → coefficient + scatter + outliers)
 *  - Low confidence (small sample)
 *  - Loading (cache still warming)
 *  - No ratings yet
 *  - Error
 */
import type { Meta } from "@storybook/react";
import { computeDrCorrelation, type DrPoint } from "@workspace/lib/dr-correlation";
import { type DomainRatingData, DomainRatingCorrelationView } from "@/components/domain-rating-correlation";
import type { CitationCategory } from "@/lib/domain-categories";

const CATEGORIES: CitationCategory[] = ["other", "institutional", "competitor", "google", "social_media", "brand"];

// Deterministic pseudo-random so screenshots are stable.
function makeRng(seed: number) {
	let s = seed;
	return () => {
		s = (s * 1103515245 + 12345) & 0x7fffffff;
		return s / 0x7fffffff;
	};
}

function makePoints(count: number, seed: number): DrPoint<CitationCategory>[] {
	const rng = makeRng(seed);
	const points: DrPoint<CitationCategory>[] = [];
	for (let i = 0; i < count; i++) {
		const rating = Math.round(5 + rng() * 90);
		// Citations broadly track DR (positive correlation) with noise.
		const base = Math.max(1, Math.round((rating / 100) * 60 * (0.5 + rng())));
		points.push({
			domain: `domain-${i}.com`,
			rating,
			count: base,
			category: CATEGORIES[i % CATEGORIES.length],
		});
	}
	// Inject clear outliers on both sides.
	points.push({ domain: "scrappy.blog", rating: 7, count: 84, category: "other" });
	points.push({ domain: "ignored-giant.com", rating: 96, count: 2, category: "institutional" });
	return points;
}

function warmed(points: DrPoint<CitationCategory>[]): DomainRatingData {
	return { total: points.length, resolved: points.length, pending: 0, brandRating: 45, correlation: computeDrCorrelation(points) };
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="mb-8">
			<div className="text-muted-foreground text-xs font-medium uppercase tracking-wide mb-2">{label}</div>
			{children}
		</div>
	);
}

export default {
	title: "Citations / Domain Rating Correlation",
} satisfies Meta;

export const States = () => {
	const lowConfidence = warmed(makePoints(6, 7));
	const noRatings: DomainRatingData = {
		total: 18,
		resolved: 18,
		pending: 0,
		brandRating: null,
		correlation: computeDrCorrelation(
			Array.from({ length: 18 }, (_, i) => ({
				domain: `d${i}.com`,
				rating: null,
				count: i + 1,
				category: "other" as CitationCategory,
			})),
		),
	};
	const loading: DomainRatingData = { ...warmed(makePoints(12, 3)), total: 120, resolved: 45, pending: 75 };

	return (
		<div className="mx-auto max-w-3xl p-6">
			<Section label="Warmed — enough rated domains">
				<DomainRatingCorrelationView data={warmed(makePoints(30, 42))} />
			</Section>
			<Section label="Low confidence — small sample">
				<DomainRatingCorrelationView data={lowConfidence} />
			</Section>
			<Section label="Loading — cache still warming">
				<DomainRatingCorrelationView data={loading} />
			</Section>
			<Section label="No ratings available yet">
				<DomainRatingCorrelationView data={noRatings} />
			</Section>
			<Section label="Error">
				<DomainRatingCorrelationView isError />
			</Section>
			<Section label="Initial load (no data)">
				<DomainRatingCorrelationView isLoading />
			</Section>
		</div>
	);
};
