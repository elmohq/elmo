import { Link } from "@tanstack/react-router";
import { costPer1kAnswersUsd, formatCostPer1k, PLANS } from "@workspace/config/plans";
import { isElmoRow, PLAN_VALUE_AS_OF, PLAN_VALUE_ROWS, type PlanValueRow } from "@/data/plan-value";
import { getComparisonSlug, getCompetitorBySlug, hasComparisonPage } from "@/lib/competitors";
import { formatPostDate } from "@/lib/format";
import { SectionHeading } from "./home/ui";

function formatMonthlyPrice(usd: number): string {
	const cents = Number.isInteger(usd) ? 0 : 2;
	return usd.toLocaleString("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: cents,
		maximumFractionDigits: cents,
	});
}

export function PlanValueChart({ rows, caption }: { rows: PlanValueRow[]; caption: string }) {
	const max = Math.max(...rows.map((row) => row.costPer1kUsd));
	return (
		<figure>
			<table className="w-full border-separate border-spacing-y-1 text-sm">
				<caption className="sr-only">{caption}</caption>
				<thead>
					<tr className="text-left font-mono text-[10px] uppercase tracking-[0.15em] text-zinc-500">
						<th scope="col" className="pb-2 pr-4 font-normal">
							Plan
						</th>
						<th scope="col" className="hidden pb-2 pr-4 text-right font-normal sm:table-cell">
							Monthly price
						</th>
						<th scope="col" className="w-[55%] pb-2 font-normal">
							Cost per 1,000 answers
						</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => {
						const elmo = isElmoRow(row);
						const share = (row.costPer1kUsd / max) * 100;
						return (
							<tr key={`${row.vendor}-${row.plan}`} className="group">
								<th
									scope="row"
									className={`rounded-l-md py-1 pr-4 pl-2 text-left whitespace-nowrap group-hover:bg-zinc-50 ${elmo ? "font-semibold text-zinc-950" : "font-normal text-zinc-700"}`}
								>
									<VendorName row={row} />
								</th>
								<td className="hidden py-1 pr-4 text-right text-zinc-600 tabular-nums group-hover:bg-zinc-50 sm:table-cell">
									{formatMonthlyPrice(row.monthlyPriceUsd)}
								</td>
								<td className="rounded-r-md py-1 pr-2 group-hover:bg-zinc-50">
									<div className="mr-14">
										<div
											className={`relative h-3.5 min-w-0.5 rounded-r ${elmo ? "bg-blue-600" : "bg-zinc-300"}`}
											style={{ width: `${share}%` }}
										>
											<span
												className={`absolute top-1/2 left-full ml-2 -translate-y-1/2 tabular-nums leading-none ${elmo ? "font-semibold text-zinc-950" : "text-zinc-600"}`}
											>
												{formatCostPer1k(row.costPer1kUsd)}
											</span>
										</div>
									</div>
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
			<figcaption className="mt-4 text-xs leading-relaxed text-zinc-500">
				One answer is one prompt checked once on one AI platform. Monthly list prices from each vendor's pricing page as
				of {formatPostDate(PLAN_VALUE_AS_OF)}, divided by the answers each plan includes at full use.
			</figcaption>
		</figure>
	);
}

function VendorName({ row }: { row: PlanValueRow }) {
	const label = `${row.vendor} ${row.plan}`;
	const competitor = row.competitorSlug ? getCompetitorBySlug(row.competitorSlug) : undefined;
	if (!competitor || !hasComparisonPage(competitor)) return label;
	return (
		<Link
			to="/ai-visibility-tools/$slug"
			params={{ slug: getComparisonSlug(competitor) }}
			className="underline decoration-zinc-300 underline-offset-2 hover:text-zinc-950 hover:decoration-zinc-500"
		>
			{label}
		</Link>
	);
}

export function PlanValueSection() {
	const cheapestElsewhere = PLAN_VALUE_ROWS.find((row) => !isElmoRow(row));
	return (
		<section id="value" className="border-b border-zinc-200 bg-white">
			<div className="mx-auto max-w-6xl px-4 py-16 md:px-6 lg:py-24">
				<SectionHeading
					title="Best value per answer."
					lede={
						<>
							Elmo Basic and Pro work out to {formatCostPer1k(costPer1kAnswersUsd(PLANS.basic))} and{" "}
							{formatCostPer1k(costPer1kAnswersUsd(PLANS.pro))} per 1,000 answers
							{cheapestElsewhere
								? `. The cheapest plan elsewhere we priced, ${cheapestElsewhere.vendor} ${cheapestElsewhere.plan}, is ${formatCostPer1k(cheapestElsewhere.costPer1kUsd)}.`
								: "."}
						</>
					}
				/>
				<div className="mt-10 max-w-4xl">
					<PlanValueChart
						rows={PLAN_VALUE_ROWS}
						caption="Cost per 1,000 answers for AI visibility tracking plans, cheapest first"
					/>
				</div>
			</div>
		</section>
	);
}
