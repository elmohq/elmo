/**
 * A cloud plan, as a card.
 *
 * Shared by the paywall picker and the billing page so a customer comparing
 * plans sees the same thing in both places — billing used to reduce plans to a
 * row of "Switch to X" buttons, which said nothing about what switching would
 * get them. The caller supplies the action and whether this plan is the active
 * one; everything else is read from the catalog.
 */
import { IconCheck, IconPlus } from "@tabler/icons-react";
import { getModelMeta } from "@workspace/config/models";
import {
	type PlanDefinition,
	type PlanPlatformGroup,
	PREMIUM_ADDON_MONTHLY_USD,
	planPlatformBreakdown,
} from "@workspace/config/plans";
import { PlatformTier, type PlatformTierRow } from "@workspace/ui/brand/platform-tier";
import { Badge } from "@workspace/ui/components/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { cn } from "@workspace/ui/lib/utils";
import type { ReactNode } from "react";

/** What the plan covers regardless of platform. */
function planQuotas(plan: PlanDefinition): string[] {
	return [`${plan.maxPrompts} tracked prompts`, "API access", "Unlimited seats"];
}

/** The catalog's tier, as the shared renderer wants it. */
function tierRows(group: PlanPlatformGroup): PlatformTierRow[] {
	return group.models.map(({ model, label }) => ({ iconId: getModelMeta(model).iconId, label }));
}

/**
 * A plan's platforms, in the three tiers it sells. The first two spend the pick
 * budget and run on every prompt; the premium tier is chosen per prompt and adds
 * to them, out of a metered pool rather than the pick budget.
 */
function PlanPlatforms({ plan }: { plan: PlanDefinition }) {
	const breakdown = planPlatformBreakdown(plan);

	return (
		<div className="space-y-3 rounded-md border bg-muted/30 p-3">
			<p className="text-xs font-medium">{breakdown.pickHeading}</p>

			{breakdown.pickGroups.map((group) => (
				<PlatformTier key={group.id} {...group} models={tierRows(group)} />
			))}

			{breakdown.premium && (
				<div className="space-y-1 border-t pt-3">
					<PlatformTier {...breakdown.premium} models={tierRows(breakdown.premium)} />
					<p className="text-[11px] leading-snug text-muted-foreground">{breakdown.premium.summary}</p>
				</div>
			)}
		</div>
	);
}

interface PlanCardProps {
	plan: PlanDefinition;
	/** Shown as the headline figure; the caller decides monthly vs annual. */
	priceUsd: number;
	priceSuffix: string;
	/** Marks the plan the org is on, so a comparison says where you already are. */
	active?: boolean;
	/** Called out as the recommended plan. */
	highlighted?: boolean;
	/** Subscribe, switch, or nothing at all for a read-only viewer. */
	action?: ReactNode;
}

export function PlanCard({ plan, priceUsd, priceSuffix, active, highlighted, action }: PlanCardProps) {
	return (
		<Card className={cn(active && "border-primary ring-1 ring-primary", !active && highlighted && "border-primary")}>
			<CardHeader>
				<CardTitle className="flex items-center justify-between gap-2">
					{plan.name}
					{active ? <Badge>Current</Badge> : highlighted ? <Badge variant="secondary">Popular</Badge> : null}
				</CardTitle>
				<div>
					<span className="text-3xl font-bold">${priceUsd.toLocaleString()}</span>
					<span className="text-muted-foreground">{priceSuffix}</span>
				</div>
			</CardHeader>
			<CardContent className="flex-1 space-y-4">
				<PlanPlatforms plan={plan} />
				<ul className="space-y-2 text-sm">
					{planQuotas(plan).map((feature) => (
						<li key={feature} className="flex items-start gap-2">
							<IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
							{feature}
						</li>
					))}
					{plan.premiumAddonAvailable && (
						<li className="flex items-start gap-2 text-muted-foreground">
							<IconPlus className="mt-0.5 h-4 w-4 shrink-0" />
							More pairings at ${PREMIUM_ADDON_MONTHLY_USD}/mo each
						</li>
					)}
				</ul>
			</CardContent>
			{action && <CardFooter>{action}</CardFooter>}
		</Card>
	);
}
