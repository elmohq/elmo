/**
 * The table scrolls sideways rather than reflowing, since a comparison whose
 * columns don't line up isn't one. Every table section names the plans again,
 * which frees the cards above to centre and stack on their own.
 */
import { IconCheck, IconMinus } from "@tabler/icons-react";
import {
	PLAN_KEYS,
	PLANS,
	PLATFORM_TIER_LABELS,
	type PlanDefinition,
	type PlanKey,
	type PlanPlatformGroupId,
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
	/** Centred suits the paywall; on a left-aligned settings page centred cards look detached. */
	align?: "center" | "start";
	/** Subscribe, switch, or nothing at all for a read-only viewer. */
	renderAction?: (plan: PlanDefinition) => ReactNode;
}

export function PlanComparison({
	annual,
	activePlan,
	highlightPlan,
	align = "center",
	renderAction,
}: PlanComparisonProps) {
	return (
		<div className="space-y-8">
			<div
				className={cn(
					"grid gap-3 sm:grid-cols-2 lg:grid-cols-4",
					align === "center" ? "mx-auto max-w-3xl" : "max-w-4xl",
				)}
			>
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
			</div>

			<PlanFeatureTable />
		</div>
	);
}

export function PlanFeatureTable() {
	return (
		<div className="overflow-x-auto pb-2">
			<div className={GRID}>
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

/** Differences live in the table, so four of these fit above the fold. */
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
				"gap-3 py-4",
				active && "border-primary ring-1 ring-primary",
				!active && highlighted && "border-primary",
			)}
		>
			<CardHeader className="px-4">
				<CardTitle className="flex flex-wrap items-center justify-center gap-1.5 text-base">
					{plan.name}
					{active ? <Badge>Current</Badge> : highlighted ? <Badge variant="secondary">Popular</Badge> : null}
				</CardTitle>
			</CardHeader>
			<CardContent className="px-4">
				<div className="flex items-baseline justify-center gap-1">
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

/**
 * Repeats the plan names because the cards are out of view by the lower rows.
 * A sticky header can't: the horizontal scroll container is the sticky
 * containing block, so a vertical offset never engages.
 */
function SectionHeading({ children }: { children: ReactNode }) {
	return (
		<>
			<div className="border-b px-3 pt-7 pb-2 text-xs font-semibold tracking-wide uppercase">{children}</div>
			{PLAN_KEYS.map((key) => (
				<div
					key={key}
					className="border-b px-3 pt-7 pb-2 text-center text-xs font-medium tracking-wide text-muted-foreground uppercase"
				>
					{PLANS[key].name}
				</div>
			))}
		</>
	);
}

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

/** `false` renders as a dash, so "not sold here" looks the same on counted and ticked rows. */
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
