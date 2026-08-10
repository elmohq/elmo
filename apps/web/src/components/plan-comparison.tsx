/**
 * The cloud plan ladder: a compact card per plan, and one detail table beneath
 * whose columns line up with them.
 *
 * The cards used to carry the full platform breakdown each, which meant the
 * same thirteen model names were printed four times and every card ran about a
 * screen tall — so comparing two plans meant scrolling past the parts they
 * agree on. Here each row is stated once and the plans differ across it, which
 * is the shape the question actually has.
 *
 * Card and table share one grid so the columns cannot drift apart. That grid
 * has a fixed minimum width and scrolls sideways below it, rather than
 * reflowing — a comparison whose columns don't line up isn't one.
 */
import { IconCheck, IconMinus } from "@tabler/icons-react";
import {
	type PlanDefinition,
	type PlanKey,
	type PlanPlatformGroupId,
	PLAN_KEYS,
	PLANS,
	PLATFORM_TIER_LABELS,
	PREMIUM_ADDON_MONTHLY_USD,
	PREMIUM_RUNS_PER_DAY,
	platformTierMembers,
	premiumPairings,
} from "@workspace/config/plans";
import { ModelIcon } from "@workspace/ui/brand/model-icon";
import { Badge } from "@workspace/ui/components/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { cn } from "@workspace/ui/lib/utils";
import type { ReactNode } from "react";

/** Label column plus one column per plan, shared by the cards and every row. */
const GRID = "grid min-w-[52rem] grid-cols-[minmax(11rem,1.1fr)_repeat(4,minmax(0,1fr))]";

interface PlanComparisonProps {
	/** Prices follow the interval the caller is showing. */
	annual: boolean;
	/** The plan the org is on, so the table says where they already are. */
	activePlan?: PlanKey | "custom" | null;
	/** Called out as the recommended plan; ignored once one is active. */
	highlightPlan?: PlanKey;
	/** Subscribe, switch, or nothing at all for a read-only viewer. */
	renderAction?: (plan: PlanDefinition) => ReactNode;
}

export function PlanComparison({ annual, activePlan, highlightPlan, renderAction }: PlanComparisonProps) {
	return (
		<div className="overflow-x-auto pb-2">
			<div className={GRID}>
				{/* Header row: the label column has nothing to say yet. */}
				<div />
				{PLAN_KEYS.map((key) => (
					<PlanHeaderCard
						key={key}
						plan={PLANS[key]}
						annual={annual}
						active={activePlan === key}
						highlighted={activePlan == null && highlightPlan === key}
						action={renderAction?.(PLANS[key])}
					/>
				))}

				<SectionHeading>Limits</SectionHeading>
				<Row label="Brands" cell={(plan) => plan.maxBrands} />
				<Row label="Tracked prompts" cell={(plan) => plan.maxPrompts} />
				<Row label="Platforms per brand" cell={(plan) => plan.platformPicks} />
				<Row label="Sampling" cell={(plan) => `${plan.standardRunsPerDay}×/day`} />
				<Row label="Seats" cell={() => "Unlimited"} />
				<Row label="API access" cell={() => true} />

				<PlatformSection tier="scraped" />
				<PlatformSection tier="api" />

				<SectionHeading>
					{PLATFORM_TIER_LABELS.premium}
					<span className="ml-2 font-mono text-[10px] font-normal text-muted-foreground tabular-nums">
						{PREMIUM_RUNS_PER_DAY}×/day
					</span>
				</SectionHeading>
				<Row
					label="Included"
					cell={(plan) => (plan.premiumIncluded > 0 ? premiumPairings(plan.premiumIncluded) : false)}
				/>
				<Row
					label="Buy more"
					cell={(plan) => (plan.premiumAddonAvailable ? `$${PREMIUM_ADDON_MONTHLY_USD}/mo each` : false)}
				/>
				{platformTierMembers("premium").map((member) => (
					<Row
						key={member.model}
						label={<ModelLabel iconId={member.iconId} label={member.label} />}
						cell={(plan) => plan.premiumIncluded > 0 || plan.premiumAddonAvailable}
					/>
				))}
			</div>
		</div>
	);
}

/**
 * Name, price and call to action. Everything a plan and its neighbours disagree
 * about lives in the table below, so this stays short enough that four of them
 * fit above the fold.
 */
function PlanHeaderCard({
	plan,
	annual,
	active,
	highlighted,
	action,
}: {
	plan: PlanDefinition;
	annual: boolean;
	active: boolean;
	highlighted: boolean;
	action?: ReactNode;
}) {
	return (
		<Card
			className={cn(
				"mx-1 gap-3 py-4",
				active && "border-primary ring-1 ring-primary",
				!active && highlighted && "border-primary",
			)}
		>
			<CardHeader className="px-4">
				<CardTitle className="flex flex-wrap items-center justify-between gap-1.5 text-base">
					{plan.name}
					{active ? (
						<Badge>Current</Badge>
					) : highlighted ? (
						<Badge variant="secondary">Popular</Badge>
					) : null}
				</CardTitle>
			</CardHeader>
			<CardContent className="px-4">
				<div className="flex items-baseline gap-1">
					<span className="text-2xl font-bold tabular-nums">
						${(annual ? plan.annualPriceUsd : plan.monthlyPriceUsd).toLocaleString()}
					</span>
					<span className="text-sm text-muted-foreground">{annual ? "/yr" : "/mo"}</span>
				</div>
			</CardContent>
			{action && <CardFooter className="px-4">{action}</CardFooter>}
		</Card>
	);
}

function SectionHeading({ children }: { children: ReactNode }) {
	return (
		<div className="col-span-5 border-b px-3 pt-6 pb-2 text-xs font-semibold tracking-wide uppercase">{children}</div>
	);
}

/** One platform tier: its models as rows, ticked on the plans that sell them. */
function PlatformSection({ tier }: { tier: Extract<PlanPlatformGroupId, "scraped" | "api"> }) {
	return (
		<>
			<SectionHeading>{PLATFORM_TIER_LABELS[tier]}</SectionHeading>
			{platformTierMembers(tier).map((member) => (
				<Row
					key={member.model}
					label={<ModelLabel iconId={member.iconId} label={member.label} />}
					cell={(plan) => plan.platformMenu.includes(member.model)}
				/>
			))}
		</>
	);
}

function ModelLabel({ iconId, label }: { iconId: string; label: string }) {
	return (
		<span className="flex items-center gap-2">
			<ModelIcon iconId={iconId} className="size-3.5 shrink-0" />
			{label}
		</span>
	);
}

/**
 * A boolean cell renders as a tick or a dash; anything else renders as itself.
 * `false` and "not sold here" are the same statement, so a plan that omits a
 * feature reads the same whether the row counts something or merely has it.
 */
function Row({ label, cell }: { label: ReactNode; cell: (plan: PlanDefinition) => ReactNode | boolean }) {
	return (
		<>
			<div className="border-b px-3 py-2 text-sm text-muted-foreground">{label}</div>
			{PLAN_KEYS.map((key) => {
				const value = cell(PLANS[key]);
				return (
					<div key={key} className="flex items-center justify-center border-b px-3 py-2 text-center text-sm">
						{value === true ? (
							<IconCheck className="size-4 text-emerald-600" aria-label="Included" />
						) : value === false ? (
							<IconMinus className="size-4 text-muted-foreground/40" aria-label="Not included" />
						) : (
							<span className="tabular-nums">{value}</span>
						)}
					</div>
				);
			})}
		</>
	);
}
