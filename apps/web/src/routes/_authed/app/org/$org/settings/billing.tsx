import { IconExternalLink } from "@tabler/icons-react";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import type { Entitlements } from "@workspace/config/entitlements";
import { PREMIUM_ADDON_MONTHLY_USD, planDisplayName, summarizeSubscriptionCost } from "@workspace/config/plans";
import { isOrgAdminRole } from "@workspace/config/roles";
import { authClient } from "@workspace/lib/auth/client";
import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Progress } from "@workspace/ui/components/progress";
import { Spinner } from "@workspace/ui/components/spinner";
import { type ReactNode, useState } from "react";
import { PlanComparison } from "@/components/plan-comparison";
import { useOrganization } from "@/hooks/use-organizations";
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
	const { id: organizationId } = useOrganization();
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

	// Only an admin with a live subscription can switch, so only they see the grid.
	const showPlanGrid = isAdmin && state.subscription !== null;

	// Wide enough for the four plan cards, which the paywall gives the same room.
	return (
		<div className="max-w-6xl space-y-6">
			<h1 className="text-3xl font-bold">Billing</h1>

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
			{state.subscription?.cancelAtPeriodEnd && entitlements.standing === "active" && (
				<Alert>
					<AlertDescription>
						Your subscription is set to cancel on {formatDate(state.subscription.periodEnd)}. You can restore it from
						the billing portal.
					</AlertDescription>
				</Alert>
			)}
			{error && (
				<Alert variant="destructive">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			<Section
				title="Plans"
				description={
					showPlanGrid
						? "Switching takes effect immediately; Stripe prorates the difference."
						: "What your organization is on, and what it costs."
				}
			>
				<SubscriptionSummary
					state={state}
					isAdmin={isAdmin}
					busy={busy}
					onOpenPortal={openPortal}
					onChoosePlan={() => router.navigate({ to: "/choose-plan" })}
					showPlanGrid={showPlanGrid}
				/>
				{showPlanGrid && (
					<PlanComparison
						annual={state.subscription?.billingInterval === "year"}
						activePlan={entitlements.planKey}
						align="start"
						renderAction={(plan) =>
							entitlements.planKey === plan.key ? (
								// The card already says this is the current plan, so the slot
								// carries the only thing left to do with it rather than sitting
								// empty and leaving "Manage billing" to a second card that
								// repeated the name and price.
								<Button
									className="w-full"
									size="sm"
									variant="outline"
									disabled={!isAdmin || busy !== null}
									onClick={openPortal}
								>
									{busy === "portal" ? <Spinner /> : "Manage"}
								</Button>
							) : (
								<Button
									className="w-full"
									size="sm"
									variant="secondary"
									// The column header carries the plan name; on its own the
									// button would just be one of four reading "Switch".
									aria-label={`Switch to ${plan.name}`}
									disabled={!isAdmin || busy !== null}
									onClick={() => changePlan(plan.key)}
								>
									{busy === `plan-${plan.key}` ? <Spinner /> : "Switch"}
								</Button>
							)
						}
					/>
				)}
				<p className="text-sm text-muted-foreground">
					Need more brands, any other models, higher numbers of samples, SSO, white label, or custom limits?{" "}
					<a className="underline" href="mailto:hello@elmohq.com?subject=Elmo%20Cloud%20custom%20plan">
						Talk to us about a custom plan
					</a>
					.
				</p>
			</Section>

			{state.premiumAddonAvailable && (
				<Section
					title="Extra premium"
					description={`Beyond what your plan includes, at $${PREMIUM_ADDON_MONTHLY_USD} per pairing per month.`}
				>
					<PremiumAddonCard
						organizationId={organizationId}
						quantity={state.premiumAddonQuantity}
						isAdmin={isAdmin}
						hasSubscription={state.subscription !== null}
					/>
				</Section>
			)}

			{showMeters(entitlements) && (
				<Section title="Usage" description="What your organization is using against its plan.">
					<UsageCard state={state} />
				</Section>
			)}
		</div>
	);
}

/**
 * The plan price is on its card; what is worth stating here is the total, which
 * an add-on makes different from it.
 */
function SubscriptionCost({
	cost,
	annual,
}: {
	cost: NonNullable<ReturnType<typeof summarizeSubscriptionCost>>;
	annual: boolean;
}) {
	return (
		<>
			{cost.lines.length > 1 && (
				<span className="text-muted-foreground">
					{cost.lines.map((line) => `${line.label} $${line.amountUsd.toLocaleString()}`).join(" · ")}
				</span>
			)}
			<span>
				<span className="text-xl font-bold tabular-nums">${cost.totalUsd.toLocaleString()}</span>
				<span className="text-muted-foreground">{annual ? "/year" : "/month"}</span>
			</span>
		</>
	);
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

/**
 * The state of the subscription in one line, plus what it bills.
 *
 * Deliberately thin: when the plan grid is showing, it already names the plan,
 * its price and which one is current, so repeating all that in a card above it
 * left two blocks saying the same thing. What is left is what the grid cannot
 * say — whether the subscription is healthy, when it renews, and how an add-on
 * adds up — and the grid's own current-plan card carries the way in to Stripe.
 */
function SubscriptionSummary({
	state,
	isAdmin,
	busy,
	onOpenPortal,
	onChoosePlan,
	showPlanGrid,
}: {
	state: BillingState;
	isAdmin: boolean;
	busy: string | null;
	onOpenPortal: () => void;
	onChoosePlan: () => void;
	showPlanGrid: boolean;
}) {
	const { entitlements, subscription } = state;
	const annual = subscription?.billingInterval === "year";

	// Only a self-serve plan has a published price; custom agreements are billed
	// outside Stripe, so there is no total to compute.
	const cost =
		subscription && entitlements.planKey !== null && entitlements.planKey !== "custom"
			? summarizeSubscriptionCost({
					plan: entitlements.planKey,
					interval: annual ? "annual" : "monthly",
					addonQuantity: state.premiumAddonQuantity,
				})
			: null;

	return (
		<div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
			<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
				{/* The grid repeats the plan name on every card, so naming it again is
				    only worth the room when the grid isn't there. */}
				{!showPlanGrid && <span className="text-base font-semibold">{planDisplayName(entitlements.planKey)}</span>}
				{subscription && (
					<Badge variant={entitlements.standing === "active" ? "secondary" : "destructive"}>
						{humanizeStatus(subscription.status)}
					</Badge>
				)}
				<span className="text-muted-foreground">
					{subscription
						? `${annual ? "Annual" : "Monthly"} billing · renews ${formatDate(subscription.periodEnd)}`
						: entitlements.planKey === "custom"
							? "Custom agreement billed outside self-serve."
							: "No subscription on file."}
				</span>
			</div>

			<div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
				{cost && <SubscriptionCost cost={cost} annual={annual} />}

				{/* Without the grid there is no current-plan card to hang these off. */}
				{isAdmin && !showPlanGrid && (
					<BillingAction
						hasSubscription={subscription !== null && subscription !== undefined}
						isCustomPlan={entitlements.planKey === "custom"}
						busy={busy}
						onOpenPortal={onOpenPortal}
						onChoosePlan={onChoosePlan}
					/>
				)}

				{!isAdmin && <span className="text-muted-foreground">Only organization admins can change the plan.</span>}
			</div>
		</div>
	);
}

/** A page section: what it is, why it is here, then the cards. */
function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
	return (
		<section className="space-y-3">
			<div>
				<h2 className="text-lg font-semibold">{title}</h2>
				<p className="text-sm text-muted-foreground">{description}</p>
			</div>
			{children}
		</section>
	);
}

function showMeters(entitlements: Entitlements): boolean {
	return !entitlements.unlimited && entitlements.planKey !== null;
}

function UsageCard({ state }: { state: BillingState }) {
	const { entitlements } = state;
	return (
		<Card>
			<CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
			</CardContent>
		</Card>
	);
}

/** Stripe's status ids are snake_case and lowercase; a badge shouldn't be. */
function humanizeStatus(status: string): string {
	const words = status.replace(/_/g, " ");
	return words.charAt(0).toUpperCase() + words.slice(1);
}

function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
	const percent = limit && limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
	return (
		<div className="space-y-1">
			<div className="flex items-center justify-between text-sm">
				<span>{label}</span>
				<span className={used > (limit ?? Number.POSITIVE_INFINITY) ? "font-medium text-destructive" : undefined}>
					{used} / {limit ?? "∞"}
				</span>
			</div>
			<Progress value={percent} />
		</div>
	);
}

function PremiumAddonCard({
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
		<Card>
			<CardContent className="space-y-3">
				{error && (
					<Alert variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}
				<div className="flex items-end gap-3">
					<div className="space-y-1">
						<Label htmlFor="premium-addon-quantity">Purchased pairings</Label>
						<Input
							id="premium-addon-quantity"
							type="number"
							min={0}
							max={1000}
							className="w-32"
							value={value}
							disabled={!isAdmin || !hasSubscription || saving}
							onChange={(event) => setValue(event.target.value)}
						/>
					</div>
					<Button onClick={save} disabled={!isAdmin || !hasSubscription || !changed || saving}>
						{saving ? <Spinner /> : "Update"}
					</Button>
				</div>
				{!hasSubscription && (
					<p className="text-sm text-muted-foreground">An active subscription is required to buy the add-on.</p>
				)}
			</CardContent>
		</Card>
	);
}
