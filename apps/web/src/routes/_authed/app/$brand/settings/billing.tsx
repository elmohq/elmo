/**
 * /app/$brand/settings/billing — plan, usage meters, and the extra-premium-
 * prompts add-on (cloud only).
 *
 * Card changes, invoices, plan switches, and cancellation go through the
 * Stripe Customer Portal / Checkout via better-auth — no card data or payment
 * state lives here. The redirect in the loader is UX only; the real gates are
 * the entitlement guards in the server functions.
 */
import { IconExternalLink, IconLoader2 } from "@tabler/icons-react";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import type { Entitlements } from "@workspace/config/entitlements";
import {
	PLAN_KEYS,
	PLANS,
	PREMIUM_ADDON_MONTHLY_USD,
	planDisplayName,
	summarizeSubscriptionCost,
} from "@workspace/config/plans";
import { isOrgAdminRole } from "@workspace/config/roles";
import { authClient } from "@workspace/lib/auth/client";
import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Progress } from "@workspace/ui/components/progress";
import { type ReactNode, useState } from "react";
import { PlanCard } from "@/components/plan-card";
import { buildTitle, getAppName, getBrandName } from "@/lib/route-head";
import { type BillingState, getBillingStateFn, setPremiumAddonQuantityFn } from "@/server/billing";

export const Route = createFileRoute("/_authed/app/$brand/settings/billing")({
	loader: async ({ params, context }): Promise<BillingState> => {
		if (!context.clientConfig?.features.billing) {
			throw redirect({ to: "/app/$brand", params: { brand: params.brand } });
		}
		return getBillingStateFn({ data: { brandId: params.brand } });
	},
	head: ({ matches, match }) => {
		const appName = getAppName(match);
		const brandName = getBrandName(matches);
		return {
			meta: [
				{ title: buildTitle("Billing", { appName, brandName }) },
				{ name: "description", content: "Manage your plan, usage, and billing." },
			],
		};
	},
	component: BillingSettingsPage,
});

function formatDate(iso: string | null): string {
	if (!iso) return "—";
	return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function BillingSettingsPage() {
	const state = Route.useLoaderData();
	const { brand: brandId } = Route.useParams();
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
			<div>
				<h1 className="text-3xl font-bold">Billing</h1>
				<p className="text-muted-foreground">
					Plan and usage for the <span className="font-medium">{state.organization.name}</span> workspace.
				</p>
			</div>

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
						: "What your workspace is on, and what it costs."
				}
			>
				<CurrentPlanCard
					state={state}
					isAdmin={isAdmin}
					busy={busy}
					onOpenPortal={openPortal}
					onChoosePlan={() => router.navigate({ to: "/choose-plan" })}
				/>
				{showPlanGrid && (
					<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
						{PLAN_KEYS.map((key) => {
							const plan = PLANS[key];
							const annual = state.subscription?.billingInterval === "year";
							const current = entitlements.planKey === key;
							return (
								<PlanCard
									key={key}
									plan={plan}
									priceUsd={annual ? plan.annualPriceUsd : plan.monthlyPriceUsd}
									priceSuffix={annual ? "/year" : "/month"}
									active={current}
									action={
										current ? undefined : (
											<Button
												className="w-full"
												variant="secondary"
												disabled={busy !== null}
												onClick={() => changePlan(key)}
											>
												{busy === `plan-${key}` ? (
													<IconLoader2 className="h-4 w-4 animate-spin" />
												) : (
													`Switch to ${plan.name}`
												)}
											</Button>
										)
									}
								/>
							);
						})}
					</div>
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
						brandId={brandId}
						quantity={state.premiumAddonQuantity}
						isAdmin={isAdmin}
						hasSubscription={state.subscription !== null}
					/>
				</Section>
			)}

			{showMeters(entitlements) && (
				<Section title="Usage" description="What your workspace is using against its plan.">
					<UsageCard state={state} />
				</Section>
			)}
		</div>
	);
}

/**
 * What the workspace is on and what it costs, which the old header buried: the
 * plan name sat beside a row of switch buttons and the total appeared nowhere, so
 * a customer with an add-on had to add it up themselves.
 */
function CurrentPlanCard({
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
		<Card>
			<CardHeader className="gap-0">
				<div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
					<div className="space-y-1">
						<CardDescription>Current plan</CardDescription>
						<CardTitle className="flex flex-wrap items-center gap-2 text-2xl">
							{planDisplayName(entitlements.planKey)}
							{subscription && (
								<Badge variant={entitlements.standing === "active" ? "secondary" : "destructive"}>
									{humanizeStatus(subscription.status)}
								</Badge>
							)}
						</CardTitle>
						{subscription ? (
							<p className="text-sm text-muted-foreground">
								{annual ? "Annual" : "Monthly"} billing · renews {formatDate(subscription.periodEnd)}
							</p>
						) : (
							<p className="text-sm text-muted-foreground">
								{entitlements.planKey === "custom"
									? "Custom agreement billed outside self-serve."
									: "No subscription on file."}
							</p>
						)}
					</div>

					{/* What it costs and what to do about it, set against the plan name so
					    neither has to stretch across the whole card. */}
					<div className="flex flex-col gap-3 sm:min-w-56 sm:items-end sm:text-right">
						{cost && (
							<div className="space-y-1.5 self-stretch">
								<div>
									<span className="text-3xl font-bold tabular-nums">${cost.totalUsd.toLocaleString()}</span>
									<span className="text-muted-foreground">{annual ? "/year" : "/month"}</span>
								</div>
								{cost.lines.length > 1 && (
									<ul className="space-y-0.5 text-sm text-muted-foreground">
										{cost.lines.map((line) => (
											<li key={line.label} className="flex justify-between gap-6">
												<span className="truncate">{line.label}</span>
												<span className="tabular-nums">${line.amountUsd.toLocaleString()}</span>
											</li>
										))}
									</ul>
								)}
							</div>
						)}

						{isAdmin &&
							(subscription ? (
								<Button variant="outline" onClick={onOpenPortal} disabled={busy !== null}>
									{busy === "portal" ? (
										<IconLoader2 className="h-4 w-4 animate-spin" />
									) : (
										<IconExternalLink className="h-4 w-4" />
									)}
									Manage billing
								</Button>
							) : (
								entitlements.planKey !== "custom" && <Button onClick={onChoosePlan}>Choose a plan</Button>
							))}
					</div>
				</div>
			</CardHeader>

			{!isAdmin && (
				<CardContent className="border-t pt-6">
					<p className="text-sm text-muted-foreground">Only workspace admins can change the plan or billing details.</p>
				</CardContent>
			)}
		</Card>
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

/** Metered plans only: an unlimited or unsubscribed workspace has nothing to measure. */
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
	brandId,
	quantity,
	isAdmin,
	hasSubscription,
}: {
	brandId: string;
	quantity: number;
	isAdmin: boolean;
	hasSubscription: boolean;
}) {
	const router = useRouter();
	const [value, setValue] = useState(String(quantity));
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const parsed = Number.parseInt(value, 10);
	const valid = Number.isInteger(parsed) && parsed >= 0 && parsed <= 1000;
	const changed = valid && parsed !== quantity;

	const save = async () => {
		setSaving(true);
		setError(null);
		try {
			await setPremiumAddonQuantityFn({ data: { brandId, quantity: parsed } });
			router.invalidate();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Could not update the add-on");
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
						{saving ? <IconLoader2 className="h-4 w-4 animate-spin" /> : "Update"}
					</Button>
				</div>
				{!hasSubscription && (
					<p className="text-sm text-muted-foreground">An active subscription is required to buy the add-on.</p>
				)}
			</CardContent>
		</Card>
	);
}
