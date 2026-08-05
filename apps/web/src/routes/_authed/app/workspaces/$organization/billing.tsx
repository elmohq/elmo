import { IconAlertTriangle, IconCheck, IconCreditCard, IconLoader2 } from "@tabler/icons-react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CLOUD_CLAUDE_PROMPT_ADDON } from "@workspace/config/plans";
import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Progress } from "@workspace/ui/components/progress";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@workspace/ui/components/sidebar";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { AppSidebar } from "@/components/app-sidebar";
import {
	CLOUD_BILLING_MAX_POLL_ATTEMPTS,
	CLOUD_BILLING_POLL_INTERVAL_MS,
	cloudBillingPath,
	isProjectedCloudSubscriptionActive,
	maximumSelectedTargets,
} from "@/lib/cloud-billing-ui";
import { safeReturnTo } from "@/lib/return-to";
import {
	changeCloudPlanFn,
	createCloudBillingPortalFn,
	getWorkspaceBillingFn,
	setCloudClaudeAddonFn,
	startCloudCheckoutFn,
	type WorkspaceBillingData,
} from "@/server/cloud-billing";

type BillingInterval = "month" | "year";
type ProjectionExpectation =
	| { kind: "active" }
	| { kind: "plan"; planId: string; interval: BillingInterval }
	| { kind: "addon"; quantity: number };

function matchesProjection(data: WorkspaceBillingData, expectation: ProjectionExpectation): boolean {
	const subscription = data.subscription;
	if (expectation.kind === "active") return isProjectedCloudSubscriptionActive(subscription);
	if (subscription?.status !== "active") return false;
	if (expectation.kind === "plan") {
		return subscription.planId === expectation.planId && subscription.interval === expectation.interval;
	}
	return subscription.claudeAddonPromptSlots === expectation.quantity;
}

function formatMoney(amountCents: number): string {
	return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
		amountCents / 100,
	);
}

function UsageCard({ label, used, limit, detail }: { label: string; used: number; limit: number; detail?: string }) {
	const percent = limit > 0 ? Math.min(100, (used / limit) * 100) : used > 0 ? 100 : 0;
	return (
		<Card className="gap-4 py-5 shadow-none">
			<CardHeader className="px-5">
				<CardDescription>{label}</CardDescription>
				<CardTitle className="text-2xl tabular-nums">
					{used.toLocaleString()}{" "}
					<span className="text-sm font-normal text-muted-foreground">/ {limit.toLocaleString()}</span>
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-2 px-5">
				<Progress value={percent} />
				{detail && <p className="text-xs text-muted-foreground">{detail}</p>}
			</CardContent>
		</Card>
	);
}

export const Route = createFileRoute("/_authed/app/workspaces/$organization/billing")({
	validateSearch: z.object({
		checkout: z.enum(["success", "cancel"]).optional(),
		returnTo: z.string().optional(),
	}),
	loader: ({ params }) => getWorkspaceBillingFn({ data: { organizationId: params.organization } }),
	pendingComponent: BillingSkeleton,
	component: WorkspaceBillingPage,
});

function WorkspaceBillingPage() {
	const { organization } = Route.useParams();
	const search = Route.useSearch();
	const loaderData = Route.useLoaderData();
	const navigate = useNavigate();
	const [data, setData] = useState(loaderData);
	const [interval, setInterval] = useState<BillingInterval>(
		loaderData.subscription?.interval === "year" ? "year" : "month",
	);
	const [addonQuantity, setAddonQuantity] = useState(loaderData.subscription?.claudeAddonPromptSlots ?? 0);
	const [pending, setPending] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [violations, setViolations] = useState<string[]>([]);
	const checkoutHandled = useRef(false);

	const refresh = useCallback(async () => {
		const next = await getWorkspaceBillingFn({ data: { organizationId: organization } });
		setData(next);
		setAddonQuantity(next.subscription?.claudeAddonPromptSlots ?? 0);
		return next;
	}, [organization]);

	const waitForProjection = useCallback(
		async (expectation: ProjectionExpectation, message: string): Promise<boolean> => {
			setPending(message);
			let lastRefreshError: unknown;
			for (let attempt = 0; attempt < CLOUD_BILLING_MAX_POLL_ATTEMPTS; attempt++) {
				try {
					const next = await refresh();
					lastRefreshError = undefined;
					if (matchesProjection(next, expectation)) {
						setPending(null);
						setError(null);
						return true;
					}
				} catch (cause) {
					lastRefreshError = cause;
				}
				await new Promise((resolve) => window.setTimeout(resolve, CLOUD_BILLING_POLL_INTERVAL_MS));
			}
			setPending(null);
			setError(
				lastRefreshError instanceof Error
					? `Stripe accepted the change, but workspace status could not be refreshed: ${lastRefreshError.message}`
					: "Stripe accepted the change, but workspace access is still syncing. Refresh this page in a moment.",
			);
			return false;
		},
		[refresh],
	);

	useEffect(() => {
		if (search.checkout !== "success" || checkoutHandled.current) return;
		checkoutHandled.current = true;
		let canceled = false;
		void (async () => {
			try {
				setError(null);
				const ready = await waitForProjection({ kind: "active" }, "Activating your workspace…");
				if (ready && !canceled) {
					if (search.returnTo) window.location.assign(safeReturnTo(search.returnTo));
					else
						await navigate({
							to: "/app/workspaces/$organization/billing",
							params: { organization },
							search: {},
							replace: true,
						});
				}
			} catch (cause) {
				if (!canceled) {
					setPending(null);
					setError(cause instanceof Error ? cause.message : "Could not refresh workspace billing");
				}
			}
		})();
		return () => {
			canceled = true;
		};
	}, [navigate, organization, search.checkout, search.returnTo, waitForProjection]);

	const currentPlan = data.plans.find((plan) => plan.id === data.subscription?.planId);
	const resolvedEntitlements =
		data.entitlements.mode === "cloud" && data.entitlements.access === "allowed"
			? data.entitlements.entitlements
			: null;
	const displayEntitlements = resolvedEntitlements ?? currentPlan?.entitlements ?? null;
	const maximumTargets = displayEntitlements?.trackingTargets.maximumSelected ?? 0;
	const usedTargets = maximumSelectedTargets(data.usage.selectedTargetsByBrand);
	const claudeLimit = displayEntitlements?.claudeTracking.enabled
		? displayEntitlements.claudeTracking.includedPromptSlots + (data.subscription?.claudeAddonPromptSlots ?? 0)
		: 0;
	const claudeAddonMaximum = displayEntitlements?.claudeTracking.enabled
		? displayEntitlements.claudeTracking.addon.maximumAdditionalPromptSlots
		: 0;
	const canManageSelfServe = data.permissions.canManage && data.permissions.selfServe;
	const subscriptionActive = isProjectedCloudSubscriptionActive(data.subscription);
	const returnTo = search.returnTo ? safeReturnTo(search.returnTo) : null;
	const addonBillingInterval = data.subscription?.interval === "year" ? "annual" : "monthly";
	const addonPrice = CLOUD_CLAUDE_PROMPT_ADDON[addonBillingInterval];
	const addonPeriodLabel = addonBillingInterval === "annual" ? "year" : "month";

	const startPlan = async (planId: (typeof data.plans)[number]["id"]) => {
		setError(null);
		setViolations([]);
		if (!subscriptionActive) {
			setPending("Opening secure checkout…");
			try {
				const billingUrl = cloudBillingPath(organization, {
					checkout: "cancel",
					...(returnTo ? { returnTo } : {}),
				});
				const successPath = cloudBillingPath(organization, {
					checkout: "success",
					...(returnTo ? { returnTo } : {}),
				});
				const checkout = await startCloudCheckoutFn({
					data: { organizationId: organization, planId, interval, successPath, cancelPath: billingUrl },
				});
				if (!checkout.accepted) {
					setPending(null);
					setError(checkout.message);
					setViolations(checkout.violations.map((violation) => violation.message));
					return;
				}
				window.location.assign(checkout.url);
			} catch (cause) {
				setPending(null);
				setError(cause instanceof Error ? cause.message : "Could not start checkout");
			}
			return;
		}

		setPending("Updating your plan…");
		try {
			const result = await changeCloudPlanFn({
				data: { organizationId: organization, planId, interval, mutationId: crypto.randomUUID() },
			});
			if (!result.accepted) {
				setPending(null);
				setError(result.message);
				setViolations(result.violations.map((violation) => violation.message));
				return;
			}
			await waitForProjection({ kind: "plan", planId, interval }, "Applying your new plan…");
		} catch (cause) {
			setPending(null);
			setError(cause instanceof Error ? cause.message : "Could not update the plan");
		}
	};

	const updateAddon = async () => {
		setError(null);
		setViolations([]);
		if (!subscriptionActive) {
			setError("Activate this workspace subscription before changing Claude prompt capacity.");
			return;
		}
		setPending("Updating Claude tracking…");
		try {
			const result = await setCloudClaudeAddonFn({
				data: { organizationId: organization, quantity: addonQuantity, mutationId: crypto.randomUUID() },
			});
			if (!result.accepted) {
				setPending(null);
				setError(result.message);
				setViolations(result.violations.map((violation) => violation.message));
				return;
			}
			await waitForProjection({ kind: "addon", quantity: addonQuantity }, "Applying Claude prompt capacity…");
		} catch (cause) {
			setPending(null);
			setError(cause instanceof Error ? cause.message : "Could not update Claude tracking");
		}
	};

	const openPortal = async () => {
		setError(null);
		setPending("Opening Stripe billing…");
		try {
			const result = await createCloudBillingPortalFn({
				data: { organizationId: organization, returnPath: cloudBillingPath(organization) },
			});
			window.location.assign(result.url);
		} catch (cause) {
			setPending(null);
			setError(cause instanceof Error ? cause.message : "Could not open Stripe billing");
		}
	};

	return (
		<SidebarProvider>
			<AppSidebar adminOnly organizationId={organization} />
			<SidebarInset className="md:border md:border-border/60 md:rounded-xl overflow-clip">
				<header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b bg-background px-4 lg:px-6">
					<SidebarTrigger className="-ml-1" />
					<IconCreditCard className="size-5 text-muted-foreground" />
					<span className="font-medium">Plan & usage</span>
				</header>
				<main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 p-4 md:p-6">
					<div className="flex flex-wrap items-start justify-between gap-4">
						<div>
							<h1 className="text-3xl font-bold tracking-tight">Plan & usage</h1>
							<p className="text-muted-foreground">Workspace billing, capacity, and tracking usage.</p>
						</div>
						<div className="flex items-center gap-2">
							<Badge variant={subscriptionActive ? "default" : "secondary"}>
								{data.subscription?.planId === "custom" ? "Custom" : (currentPlan?.displayName ?? "No plan")}
							</Badge>
							{data.subscription && <Badge variant="outline">{data.subscription.status}</Badge>}
						</div>
					</div>

					{pending && (
						<Alert>
							<IconLoader2 className="animate-spin" />
							<AlertTitle>{pending}</AlertTitle>
							<AlertDescription>
								Stripe has accepted the request. Access updates after its signed webhook is projected here.
							</AlertDescription>
						</Alert>
					)}
					{search.checkout === "cancel" && (
						<Alert>
							<IconAlertTriangle />
							<AlertTitle>Checkout canceled</AlertTitle>
							<AlertDescription>No charge was made. Choose a plan when you are ready.</AlertDescription>
						</Alert>
					)}
					{error && (
						<Alert variant="destructive">
							<IconAlertTriangle />
							<AlertTitle>{error}</AlertTitle>
							{violations.length > 0 && (
								<AlertDescription>
									<ul className="list-disc pl-5">
										{violations.map((violation) => (
											<li key={violation}>{violation}</li>
										))}
									</ul>
									<p>Reduce the listed workspace usage, then retry the plan change.</p>
								</AlertDescription>
							)}
						</Alert>
					)}

					{displayEntitlements && (
						<section className="space-y-4">
							<h2 className="text-xl font-semibold">Workspace usage</h2>
							<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
								<UsageCard
									label="Enabled brands"
									used={data.usage.enabledBrands}
									limit={displayEntitlements.brandSlots}
								/>
								<UsageCard
									label="Enabled prompts"
									used={data.usage.enabledPrompts}
									limit={displayEntitlements.promptSlots}
								/>
								<UsageCard
									label="Models per brand"
									used={usedTargets}
									limit={maximumTargets}
									detail="Highest selected model count on one brand"
								/>
								<UsageCard
									label="Claude prompts"
									used={data.usage.claudePromptAssignments}
									limit={claudeLimit}
									detail={
										data.subscription?.claudeAddonPromptSlots
											? `${data.subscription.claudeAddonPromptSlots} paid add-on slots`
											: "Included and add-on slots"
									}
								/>
							</div>
						</section>
					)}

					{data.subscription?.planId === "custom" ? (
						<Card>
							<CardHeader>
								<CardTitle>Operator-managed custom plan</CardTitle>
								<CardDescription>
									Your pricing, models, cadence, and capacities are defined by your contract. Self-service changes are
									disabled.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<Button asChild variant="outline">
									<a href="mailto:support@elmohq.com?subject=Elmo%20Cloud%20custom%20plan">Contact support</a>
								</Button>
							</CardContent>
						</Card>
					) : (
						<section className="space-y-4">
							<div className="flex flex-wrap items-center justify-between gap-3">
								<div>
									<h2 className="text-xl font-semibold">Plans</h2>
									<p className="text-sm text-muted-foreground">Annual billing includes two months free.</p>
								</div>
								<div className="flex rounded-md border p-1">
									<Button
										size="sm"
										variant={interval === "month" ? "secondary" : "ghost"}
										onClick={() => setInterval("month")}
									>
										Monthly
									</Button>
									<Button
										size="sm"
										variant={interval === "year" ? "secondary" : "ghost"}
										onClick={() => setInterval("year")}
									>
										Annual
									</Button>
								</div>
							</div>
							<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
								{data.plans.map((plan) => {
									const selected = data.subscription?.planId === plan.id && data.subscription.interval === interval;
									const amount = interval === "year" ? plan.annualAmountCents : plan.monthlyAmountCents;
									return (
										<Card key={plan.id} className={selected ? "border-primary" : undefined}>
											<CardHeader>
												<div className="flex items-center justify-between">
													<CardTitle>{plan.displayName}</CardTitle>
													{selected && <IconCheck className="size-5 text-primary" />}
												</div>
												<CardDescription>
													<span className="text-2xl font-semibold text-foreground">{formatMoney(amount)}</span> /{" "}
													{interval}
												</CardDescription>
											</CardHeader>
											<CardContent className="space-y-3 text-sm">
												<ul className="space-y-1 text-muted-foreground">
													<li>{plan.entitlements.brandSlots} brand slots</li>
													<li>{plan.entitlements.promptSlots} tracked prompts</li>
													<li>Up to {plan.entitlements.trackingTargets.maximumSelected} models per brand</li>
													<li>
														{plan.entitlements.claudeTracking.enabled
															? `${plan.entitlements.claudeTracking.includedPromptSlots} Claude prompts included`
															: "Claude add-on unavailable"}
													</li>
												</ul>
												<Button
													className="w-full"
													variant={selected ? "secondary" : "default"}
													disabled={!canManageSelfServe || Boolean(pending) || selected}
													onClick={() => startPlan(plan.id)}
												>
													{selected ? "Current plan" : data.subscription ? "Change plan" : "Choose plan"}
												</Button>
											</CardContent>
										</Card>
									);
								})}
							</div>
						</section>
					)}

					{data.subscription?.planId !== "custom" && displayEntitlements?.claudeTracking.enabled && (
						<Card>
							<CardHeader>
								<CardTitle>Claude native web-search prompts</CardTitle>
								<CardDescription>
									Add prompt slots at {formatMoney(addonPrice.unitAmountCents)} each per {addonPeriodLabel}.
								</CardDescription>
							</CardHeader>
							<CardContent className="flex flex-wrap items-end gap-3">
								<div className="space-y-2">
									<Label htmlFor="claude-addon">Additional prompt slots</Label>
									<Input
										id="claude-addon"
										type="number"
										min={0}
										max={claudeAddonMaximum}
										value={addonQuantity}
										onChange={(event) => setAddonQuantity(Number(event.target.value))}
										className="w-40"
									/>
								</div>
								<Button
									disabled={
										!canManageSelfServe ||
										!subscriptionActive ||
										Boolean(pending) ||
										addonQuantity === data.subscription?.claudeAddonPromptSlots ||
										!Number.isInteger(addonQuantity) ||
										addonQuantity < 0 ||
										addonQuantity > claudeAddonMaximum
									}
									onClick={updateAddon}
								>
									Update Claude capacity
								</Button>
							</CardContent>
						</Card>
					)}

					{data.usageBuckets.length > 0 && (
						<section className="space-y-3">
							<h2 className="text-xl font-semibold">Current tracking periods</h2>
							<div className="grid gap-3 md:grid-cols-2">
								{data.usageBuckets.map((bucket) => (
									<UsageCard
										key={`${bucket.usageClass}:${bucket.quotaKey}:${bucket.periodStart}`}
										label={`${bucket.usageClass} tracking`}
										used={bucket.usedUnits}
										limit={bucket.limitUnits}
										detail={`Resets ${new Date(bucket.periodEnd).toLocaleString()}`}
									/>
								))}
							</div>
						</section>
					)}

					<div className="flex flex-wrap gap-3 border-t pt-6">
						{returnTo && subscriptionActive && (
							<Button onClick={() => window.location.assign(returnTo)}>Continue setting up your brand</Button>
						)}
						{canManageSelfServe && data.subscription?.stripeCustomerId && (
							<Button variant="outline" disabled={Boolean(pending)} onClick={openPortal}>
								Manage payment method and invoices in Stripe
							</Button>
						)}
						{!data.permissions.canManage && (
							<p className="text-sm text-muted-foreground">Only workspace owners and admins can change billing.</p>
						)}
					</div>
				</main>
			</SidebarInset>
		</SidebarProvider>
	);
}

function BillingSkeleton() {
	return (
		<div className="mx-auto max-w-6xl space-y-6 p-6">
			<Skeleton className="h-10 w-64" />
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{[0, 1, 2, 3].map((item) => (
					<Skeleton key={item} className="h-36" />
				))}
			</div>
			<Skeleton className="h-80" />
		</div>
	);
}
