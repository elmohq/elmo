import { IconArrowUpRight, IconChevronDown, IconExternalLink } from "@tabler/icons-react";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import type { Entitlements } from "@workspace/config/entitlements";
import {
	PLAN_KEYS,
	PLANS,
	type PlanDefinition,
	PREMIUM_ADDON_MONTHLY_USD,
	planDisplayName,
	summarizeSubscriptionCost,
} from "@workspace/config/plans";
import { isOrgAdminRole } from "@workspace/config/roles";
import { authClient } from "@workspace/lib/auth/client";
import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@workspace/ui/components/collapsible";
import { Input } from "@workspace/ui/components/input";
import { Progress } from "@workspace/ui/components/progress";
import { Spinner } from "@workspace/ui/components/spinner";
import { cn } from "@workspace/ui/lib/utils";
import { useState } from "react";
import { PlanFeatureTable } from "@/components/plan-comparison";
import { pageHead } from "@/lib/route-head";
import { useWriteErrorMessage } from "@/lib/write-errors";
import { type BillingState, getBillingStateFn, setPremiumAddonQuantityFn } from "@/server/billing";

export const Route = createFileRoute("/_authed/app/org/$org/settings/billing")({
	staticData: { crumb: "Billing" },
	loader: async ({ params, context }): Promise<BillingState> => {
		if (!context.clientConfig?.features.billing) {
			throw redirect({ to: "/app/org/$org", params: { org: params.org } });
		}
		return getBillingStateFn({ data: { organizationId: context.organization.id } });
	},
	head: pageHead({ description: "Manage your plan, usage, and billing." }),
	component: BillingSettingsPage,
});

function formatDate(iso: string | null): string {
	if (!iso) return "—";
	return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function BillingSettingsPage() {
	const state = Route.useLoaderData();
	const router = useRouter();
	const isAdmin = isOrgAdminRole(state.organization.role);
	const { entitlements } = state;
	const [busy, setBusy] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const openPortal = async () => {
		setBusy("portal");
		setError(null);
		const { error: portalError } = await authClient.subscription.billingPortal({
			referenceId: state.organization.id,
			customerType: "organization",
			returnUrl: window.location.href,
		});
		if (portalError) {
			setError(portalError.message ?? "Could not open the billing portal");
			setBusy(null);
		}
	};

	const changePlan = async (plan: string) => {
		setBusy(`plan-${plan}`);
		setError(null);
		const { error: upgradeError } = await authClient.subscription.upgrade({
			plan,
			annual: state.subscription?.billingInterval === "year",
			referenceId: state.organization.id,
			customerType: "organization",
			...(state.subscription && { subscriptionId: state.subscription.id }),
			successUrl: window.location.href,
			cancelUrl: window.location.href,
			disableRedirect: false,
		});
		if (upgradeError) {
			setError(upgradeError.message ?? "Could not change the plan");
		}
		setBusy(null);
		router.invalidate();
	};

	// Only an admin with a live subscription can switch, so only they see the plans.
	const showPlans = isAdmin && state.subscription !== null;
	const meters = showMeters(entitlements);

	return (
		<div className="max-w-6xl space-y-8">
			<div>
				<h1 className="text-3xl font-bold">Billing</h1>
				<p className="text-muted-foreground">Your plan, what it costs, and how much of it you're using.</p>
			</div>

			<StandingAlerts state={state} error={error} />

			<Card className="gap-0 py-0">
				<div className={cn("grid", meters && "md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]")}>
					<SubscriptionSummary
						state={state}
						isAdmin={isAdmin}
						busy={busy}
						onOpenPortal={openPortal}
						onChoosePlan={() => router.navigate({ to: "/choose-plan" })}
					/>
					{meters && <UsagePanel state={state} />}
				</div>
				{state.premiumAddonAvailable && (
					<PremiumAddonSection
						organizationId={state.organization.id}
						quantity={state.premiumAddonQuantity}
						isAdmin={isAdmin}
						hasSubscription={state.subscription !== null}
					/>
				)}
			</Card>

			{showPlans && (
				<PlanPicker
					annual={state.subscription?.billingInterval === "year"}
					activePlan={entitlements.planKey}
					busy={busy}
					onSwitch={changePlan}
				/>
			)}

			{entitlements.planKey !== "custom" && <CustomPlanCallout />}
		</div>
	);
}

function StandingAlerts({ state, error }: { state: BillingState; error: string | null }) {
	const { entitlements, subscription } = state;
	const cancelling = subscription?.cancelAtPeriodEnd && entitlements.standing === "active";
	if (entitlements.standing === "active" && !cancelling && !error) return null;

	return (
		<div className="space-y-3">
			{entitlements.standing === "grace" && (
				<Alert variant="destructive">
					<AlertTitle>Payment failed</AlertTitle>
					<AlertDescription>
						We couldn't renew your subscription. Tracking continues for a few more days while Stripe retries — update
						your card in the billing portal to avoid a pause.
					</AlertDescription>
				</Alert>
			)}
			{entitlements.standing === "paused" && (
				<Alert variant="destructive">
					<AlertTitle>Tracking paused</AlertTitle>
					<AlertDescription>
						Payment is more than a week overdue, so prompt tracking is paused. Your data stays readable; fix the payment
						in the billing portal and tracking resumes automatically.
					</AlertDescription>
				</Alert>
			)}
			{entitlements.standing === "none" && (
				<Alert variant="destructive">
					<AlertTitle>No active subscription</AlertTitle>
					<AlertDescription>Tracking is stopped until a plan is chosen.</AlertDescription>
				</Alert>
			)}
			{cancelling && (
				<Alert>
					<AlertDescription>
						Your subscription is set to cancel on {formatDate(subscription.periodEnd)}. You can restore it from the
						billing portal.
					</AlertDescription>
				</Alert>
			)}
			{error && (
				<Alert variant="destructive">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}
		</div>
	);
}

/** Only a self-serve plan has a published price; custom agreements are billed
 *  outside Stripe, so there is no total to compute. */
function resolveSubscriptionCost(state: BillingState, annual: boolean) {
	const { entitlements, subscription } = state;
	if (!subscription || entitlements.planKey === null || entitlements.planKey === "custom") return null;

	return summarizeSubscriptionCost({
		plan: entitlements.planKey,
		interval: annual ? "annual" : "monthly",
		addonQuantity: state.premiumAddonQuantity,
	});
}

function billingCadenceLine(state: BillingState, annual: boolean): string {
	const { entitlements, subscription } = state;
	if (subscription) return `${annual ? "Annual" : "Monthly"} billing · renews ${formatDate(subscription.periodEnd)}`;
	if (entitlements.planKey === "custom") return "Custom agreement billed outside self-serve.";
	return "No subscription on file.";
}

function BillingAction({
	hasSubscription,
	isCustomPlan,
	busy,
	onOpenPortal,
	onChoosePlan,
}: {
	hasSubscription: boolean;
	isCustomPlan: boolean;
	busy: string | null;
	onOpenPortal: () => void;
	onChoosePlan: () => void;
}) {
	if (hasSubscription) {
		return (
			<Button variant="outline" size="sm" onClick={onOpenPortal} disabled={busy !== null}>
				{busy === "portal" ? <Spinner /> : <IconExternalLink className="h-4 w-4" />}
				Manage billing
			</Button>
		);
	}
	// A custom agreement is billed outside self-serve, so there is nothing to buy.
	if (isCustomPlan) return null;
	return (
		<Button size="sm" onClick={onChoosePlan}>
			Choose a plan
		</Button>
	);
}

/** Which plan, whether it is healthy, what it bills, and the way in to Stripe. */
function SubscriptionSummary({
	state,
	isAdmin,
	busy,
	onOpenPortal,
	onChoosePlan,
}: {
	state: BillingState;
	isAdmin: boolean;
	busy: string | null;
	onOpenPortal: () => void;
	onChoosePlan: () => void;
}) {
	const { entitlements, subscription } = state;
	const annual = subscription?.billingInterval === "year";
	const cost = resolveSubscriptionCost(state, annual);

	return (
		<div className="flex flex-col justify-between gap-5 p-6">
			<div className="space-y-1">
				<div className="flex flex-wrap items-center gap-2">
					<h2 className="font-semibold">
						{entitlements.planKey === null ? "No plan" : `${planDisplayName(entitlements.planKey)} plan`}
					</h2>
					{subscription && (
						<Badge variant={entitlements.standing === "active" ? "secondary" : "destructive"}>
							{humanizeStatus(subscription.status)}
						</Badge>
					)}
				</div>
				<p className="text-sm text-muted-foreground">{billingCadenceLine(state, annual)}</p>
			</div>

			{cost && (
				<div>
					<span className="text-3xl font-bold tabular-nums">${cost.totalUsd.toLocaleString()}</span>
					<span className="text-muted-foreground"> {annual ? "/year" : "/month"}</span>
					{/* The plan price is on its card; the breakdown only earns a line
					    once an add-on makes the total differ from it. */}
					{cost.lines.length > 1 && (
						<p className="text-sm text-muted-foreground">
							{cost.lines.map((line) => `${line.label} $${line.amountUsd.toLocaleString()}`).join(" + ")}
						</p>
					)}
				</div>
			)}

			{isAdmin ? (
				<div>
					<BillingAction
						hasSubscription={Boolean(subscription)}
						isCustomPlan={entitlements.planKey === "custom"}
						busy={busy}
						onOpenPortal={onOpenPortal}
						onChoosePlan={onChoosePlan}
					/>
				</div>
			) : (
				<p className="text-sm text-muted-foreground">Only organization admins can change the plan.</p>
			)}
		</div>
	);
}

function showMeters(entitlements: Entitlements): boolean {
	return !entitlements.unlimited && entitlements.planKey !== null;
}

function UsagePanel({ state }: { state: BillingState }) {
	const { entitlements } = state;
	return (
		<div className="flex flex-col gap-5 border-t p-6 md:border-t-0 md:border-l">
			<h2 className="font-semibold">Usage</h2>
			<UsageMeter label="Brands" used={state.usage.brands} limit={entitlements.maxBrands} />
			<UsageMeter label="Tracked prompts" used={state.usage.enabledPrompts} limit={entitlements.maxPrompts} />
			{entitlements.premiumPool > 0 && (
				<UsageMeter
					label={
						state.premiumAddonQuantity > 0
							? `Premium pairings (${state.premiumAddonQuantity} purchased)`
							: "Premium pairings"
					}
					used={state.usage.premiumAssigned}
					limit={entitlements.premiumPool}
				/>
			)}
		</div>
	);
}

/** Stripe's status ids are snake_case and lowercase; a badge shouldn't be. */
function humanizeStatus(status: string): string {
	const words = status.replace(/_/g, " ");
	return words.charAt(0).toUpperCase() + words.slice(1);
}

function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
	const percent = limit && limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
	const over = used > (limit ?? Number.POSITIVE_INFINITY);
	return (
		<div className="space-y-2">
			<div className="flex items-baseline justify-between gap-3 text-sm">
				<span className="text-muted-foreground">{label}</span>
				<span className={cn("font-medium tabular-nums", over && "text-destructive")}>
					{used} / {limit ?? "∞"}
				</span>
			</div>
			<Progress value={percent} />
		</div>
	);
}

function PremiumAddonSection({
	organizationId,
	quantity,
	isAdmin,
	hasSubscription,
}: {
	organizationId: string;
	quantity: number;
	isAdmin: boolean;
	hasSubscription: boolean;
}) {
	const router = useRouter();
	const [value, setValue] = useState(String(quantity));
	const writeError = useWriteErrorMessage();
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const parsed = Number.parseInt(value, 10);
	const valid = Number.isInteger(parsed) && parsed >= 0 && parsed <= 1000;
	const changed = valid && parsed !== quantity;

	const save = async () => {
		setSaving(true);
		setError(null);
		try {
			await setPremiumAddonQuantityFn({ data: { organizationId, quantity: parsed } });
			router.invalidate();
		} catch (err) {
			setError(writeError(err, "Could not update the add-on"));
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="space-y-4 border-t p-6">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 className="font-semibold">Extra premium pairings</h2>
					<p className="text-sm text-muted-foreground">
						{hasSubscription
							? `$${PREMIUM_ADDON_MONTHLY_USD} per pairing per month, beyond what your plan includes.`
							: "An active subscription is required to buy the add-on."}
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Input
						aria-label="Purchased pairings"
						type="number"
						min={0}
						max={1000}
						className="w-20 tabular-nums"
						value={value}
						disabled={!isAdmin || !hasSubscription || saving}
						onChange={(event) => setValue(event.target.value)}
					/>
					<Button variant="outline" onClick={save} disabled={!isAdmin || !hasSubscription || !changed || saving}>
						{saving ? <Spinner /> : "Update"}
					</Button>
				</div>
			</div>
			{error && (
				<Alert variant="destructive">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}
		</div>
	);
}

/**
 * The plans a switch could reach, each with its headline limits. The full
 * comparison is folded away: the card above already answers what the org is
 * on, so the table is only for someone weighing a change.
 */
function PlanPicker({
	annual,
	activePlan,
	busy,
	onSwitch,
}: {
	annual: boolean;
	activePlan: Entitlements["planKey"];
	busy: string | null;
	onSwitch: (plan: string) => void;
}) {
	return (
		<section className="space-y-4">
			<div>
				<h2 className="text-lg font-semibold">Plans</h2>
				<p className="text-sm text-muted-foreground">
					Switching takes effect immediately; Stripe prorates the difference.
				</p>
			</div>
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				{PLAN_KEYS.map((key) => (
					<PlanCard
						key={key}
						plan={PLANS[key]}
						annual={annual}
						active={activePlan === key}
						busy={busy}
						onSwitch={onSwitch}
					/>
				))}
			</div>
			<Collapsible>
				<CollapsibleTrigger
					className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "group -ml-2 text-muted-foreground")}
				>
					Compare all features
					<IconChevronDown className="h-4 w-4 transition-transform group-data-[panel-open]:rotate-180" />
				</CollapsibleTrigger>
				<CollapsibleContent className="pt-2">
					<PlanFeatureTable />
				</CollapsibleContent>
			</Collapsible>
		</section>
	);
}

function PlanCard({
	plan,
	annual,
	active,
	busy,
	onSwitch,
}: {
	plan: PlanDefinition;
	annual: boolean;
	active: boolean;
	busy: string | null;
	onSwitch: (plan: string) => void;
}) {
	return (
		<Card className={cn("gap-3 py-4", active && "border-primary ring-1 ring-primary")}>
			<CardHeader className="px-4">
				<CardTitle className="flex items-center gap-1.5 text-base">
					{plan.name}
					{active && <Badge>Current</Badge>}
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-3 px-4">
				<div className="flex items-baseline gap-1">
					<span className="text-2xl font-bold tabular-nums">
						${(annual ? plan.annualPriceUsd : plan.monthlyPriceUsd).toLocaleString()}
					</span>
					<span className="text-sm text-muted-foreground">{annual ? "/yr" : "/mo"}</span>
				</div>
				<p className="text-sm text-muted-foreground">
					{plan.maxBrands} {plan.maxBrands === 1 ? "brand" : "brands"} · {plan.maxPrompts} prompts
					{plan.premiumIncluded > 0 && ` · ${plan.premiumIncluded} premium`}
				</p>
			</CardContent>
			<CardFooter className="px-4">
				{active ? (
					<Button className="w-full" size="sm" variant="outline" disabled>
						Your plan
					</Button>
				) : (
					<Button
						className="w-full"
						size="sm"
						variant="secondary"
						// The card title carries the plan name; on its own the button
						// would just be one of three reading "Switch".
						aria-label={`Switch to ${plan.name}`}
						disabled={busy !== null}
						onClick={() => onSwitch(plan.key)}
					>
						{busy === `plan-${plan.key}` ? <Spinner /> : "Switch"}
					</Button>
				)}
			</CardFooter>
		</Card>
	);
}

function CustomPlanCallout() {
	return (
		<div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed p-4">
			<div>
				<p className="text-sm font-medium">Need a custom plan?</p>
				<p className="text-sm text-muted-foreground">
					More brands, any other models, higher numbers of samples, SSO, white label, or custom limits.
				</p>
			</div>
			<a
				className={buttonVariants({ variant: "outline", size: "sm" })}
				href="mailto:hello@elmohq.com?subject=Elmo%20Cloud%20custom%20plan"
			>
				Talk to us
				<IconArrowUpRight className="h-4 w-4" />
			</a>
		</div>
	);
}
