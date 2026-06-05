/**
 * Opportunities — "Source targets" variant.
 *
 * The most AEO-native lens: to be mentioned in an AI answer you generally need
 * to be in the sources the model cites for that prompt. This ranks the domains
 * cited across the prompts you're losing, by how many prompts each one touches —
 * so you target the sources with the most reach first. A "Target" badge marks
 * sources you're not yet cited on (the action), vs ones you already appear on.
 *
 * Efficiently computable: aggregate the citations table (domain per prompt_run)
 * over the opportunity prompts; "covered" = your domain appears for that prompt.
 */
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";

export interface SourceTarget {
	domain: string;
	/** How many of your opportunity prompts cite this domain. */
	prompts: number;
	/** Whether your brand already appears on this domain. */
	covered: boolean;
}

export function OpportunitiesSources({ sources }: { sources: SourceTarget[] }) {
	const ranked = [...sources].sort((a, b) => b.prompts - a.prompts);
	const max = Math.max(1, ...ranked.map((s) => s.prompts));

	return (
		<PageHeader
			title="Opportunities"
			subtitle="Get cited where the answers come from — the sources behind the prompts you're missing."
		>
			<div className="pt-2">
				<Card>
					<CardHeader>
						<CardTitle className="text-base">Source targets</CardTitle>
						<CardDescription>
							Domains AI cites across prompts where competitors lead and you trail, ranked by reach. Earning a mention
							on the high-reach "Target" sources can move several prompts at once.
						</CardDescription>
					</CardHeader>
					<CardContent className="divide-y divide-border/60 pt-0">
						{ranked.map((s) => (
							<div key={s.domain} className="flex items-center gap-4 py-3">
								<div className="w-44 shrink-0 truncate text-sm font-medium" title={s.domain}>
									{s.domain}
								</div>
								<div className="h-2.5 flex-1 rounded-full bg-muted">
									<div
										className="h-full rounded-full bg-violet-400 dark:bg-violet-500"
										style={{ width: `${(s.prompts / max) * 100}%` }}
									/>
								</div>
								<div className="w-24 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
									{s.prompts} prompt{s.prompts === 1 ? "" : "s"}
								</div>
								<span
									className={`w-20 shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-medium ${
										s.covered
											? "bg-muted text-muted-foreground"
											: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
									}`}
								>
									{s.covered ? "Cited" : "Target"}
								</span>
							</div>
						))}
					</CardContent>
				</Card>
			</div>
		</PageHeader>
	);
}
