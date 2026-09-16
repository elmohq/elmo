import { IconAdOff } from "@tabler/icons-react";
import { Card, CardContent } from "@workspace/ui/components/card";
import type { ReactNode } from "react";
import { formatDay } from "@/components/ads/shared";
import type { AdsData } from "@/components/ads/types";

function EmptyCard({ title, children }: { title: string; children: ReactNode }) {
	return (
		<Card>
			<CardContent className="flex flex-col items-center gap-2 py-12 text-center">
				<IconAdOff className="size-8 text-muted-foreground/60" />
				<p className="font-medium">{title}</p>
				<div className="max-w-md text-sm text-muted-foreground">{children}</div>
			</CardContent>
		</Card>
	);
}

/**
 * Four different nothings, which the page must not collapse into one message:
 * the brand tracks no surface that can show ads, it tracks one but has no
 * answers yet, or it has answers and genuinely drew no ads — and that last case
 * splits again on whether ads were ever seen.
 *
 * "Nobody is buying against you" and "the surface stopped showing us ads" are
 * opposite findings that produce an identical empty table, and the difference is
 * unobservable: eligibility turns on things no payload reports (a free or
 * logged-out session, an English-speaking market), so a scraper that drifts out
 * of them looks exactly like an uncontested prompt set.
 */
export function AdsEmptyState({ data, settingsHref }: { data: AdsData; settingsHref?: ReactNode }) {
	if (data.surfaces.length === 0) {
		return (
			<EmptyCard title="No ad-capable platforms tracked">
				Ads only appear on platforms we read from the consumer product — today that is ChatGPT and Google AI Mode. A
				model called through its API never shows one. {settingsHref}
			</EmptyCard>
		);
	}

	if (data.eligibleRuns === 0) {
		return (
			<EmptyCard title="No answers in this period">
				None of your ad-capable platforms produced an answer in this window, so there was nowhere for an ad to appear.
				Try a longer period.
			</EmptyCard>
		);
	}

	const lastAdAt = data.surfaces
		.map((surface) => surface.lastAdAt)
		.filter((value): value is string => Boolean(value))
		.sort()
		.at(-1);

	return (
		<EmptyCard title="No ads on your prompts in this period">
			{lastAdAt ? (
				<>
					Nothing was recorded across {data.eligibleRuns.toLocaleString()} answers. The most recent ad we saw on any of
					your prompts was {formatDay(lastAdAt)} — so either nobody is buying against you right now, or the platform has
					stopped showing ads to us.
				</>
			) : (
				<>
					Nothing was recorded across {data.eligibleRuns.toLocaleString()} answers, and we have never seen an ad on
					these prompts. Ad coverage is still thin on most queries; this is the common case.
				</>
			)}
		</EmptyCard>
	);
}
