/**
 * /app/$brand/settings/billing — plan, usage meters, and the extra-Claude-
 * prompts add-on (cloud only).
 *
 * Card changes, invoices, plan switches, and cancellation go through the
 * Stripe Customer Portal / Checkout via better-auth — no card data or payment
 * state lives here. The redirect in the loader is UX only; the real gates are
 * the entitlement guards in the server functions.
 */
import { IconExternalLink, IconLoader2 } from "@tabler/icons-react";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { CLAUDE_ADDON_MONTHLY_USD, PLANS, planDisplayName } from "@workspace/config/plans";
import { authClient } from "@workspace/lib/auth/client";
import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Progress } from "@workspace/ui/components/progress";
import { useState } from "react";
import { getDeployment } from "@/lib/config/server";
import { buildTitle, getAppName, getBrandName } from "@/lib/route-head";
import { type BillingState, getBillingStateFn, setClaudeAddonQuantityFn } from "@/server/billing";

const getBillingEnabled = createServerFn({ method: "GET" }).handler(async () => {
	return { billing: getDeployment().features.billing };
});

export const Route = createFileRoute("/_authed/app/$brand/settings/billing")({
	loader: async ({ params }): Promise<BillingState> => {
		const { billing } = await getBillingEnabled();
		if (!billing) {
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
	const isAdmin = state.organization.role === "admin" || state.organization.role === "owner";
	const { entitlements } = state;
	const [busy, setBusy] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const planName = planDisplayName(entitlements.planKey);

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

	return (
		<div className="max-w-4xl space-y-6">
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

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						{planName} plan
						{state.subscription && <Badge variant="secondary">{state.subscription.status}</Badge>}
					</CardTitle>
					<CardDescription>
						{state.subscription
							? `${state.subscription.billingInterval === "year" ? "Annual" : "Monthly"} billing · renews ${formatDate(state.subscription.periodEnd)}`
							: entitlements.planKey === "custom"
								? "Custom agreement billed outside self-serve."
								: "No subscription on file."}
					</CardDescription>
				</CardHeader>
				{isAdmin && (
					<CardContent className="flex flex-wrap gap-2">
						{state.subscription && (
							<>
								<Button variant="outline" onClick={openPortal} disabled={busy !== null}>
									{busy === "portal" ? (
										<IconLoader2 className="h-4 w-4 animate-spin" />
									) : (
										<IconExternalLink className="h-4 w-4" />
									)}
									Manage billing
								</Button>
								{Object.values(PLANS)
									.filter((plan) => plan.key !== entitlements.planKey)
									.map((plan) => (
										<Button
											key={plan.key}
											variant="ghost"
											disabled={busy !== null}
											onClick={() => changePlan(plan.key)}
										>
											{busy === `plan-${plan.key}` ? (
												<IconLoader2 className="h-4 w-4 animate-spin" />
											) : (
												`Switch to ${plan.name}`
											)}
										</Button>
									))}
							</>
						)}
						{!state.subscription && entitlements.planKey !== "custom" && (
							<Button onClick={() => router.navigate({ to: "/choose-plan" })}>Choose a plan</Button>
						)}
					</CardContent>
				)}
				{!isAdmin && (
					<CardContent className="text-sm text-muted-foreground">
						Only workspace admins can change the plan or billing details.
					</CardContent>
				)}
			</Card>

			{!entitlements.unlimited && entitlements.planKey !== null && (
				<Card>
					<CardHeader>
						<CardTitle>Usage</CardTitle>
						<CardDescription>What your workspace is using against its plan.</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<UsageMeter label="Brands" used={state.usage.brands} limit={entitlements.maxBrands} />
						<UsageMeter label="Tracked prompts" used={state.usage.enabledPrompts} limit={entitlements.maxPrompts} />
						{entitlements.claudePool > 0 && (
							<UsageMeter
								label={`Claude tracking prompts (includes ${state.claudeAddonQuantity} purchased)`}
								used={state.usage.claudeAssigned}
								limit={entitlements.claudePool}
							/>
						)}
					</CardContent>
				</Card>
			)}

			{state.claudeAddonAvailable && (
				<ClaudeAddonCard
					brandId={brandId}
					quantity={state.claudeAddonQuantity}
					isAdmin={isAdmin}
					hasSubscription={state.subscription !== null}
				/>
			)}
		</div>
	);
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

function ClaudeAddonCard({
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
			await setClaudeAddonQuantityFn({ data: { brandId, quantity: parsed } });
			router.invalidate();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Could not update the add-on");
		} finally {
			setSaving(false);
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Extra Claude prompts</CardTitle>
				<CardDescription>
					Expand your Claude tracking pool for ${CLAUDE_ADDON_MONTHLY_USD}/prompt/month, prorated by Stripe.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				{error && (
					<Alert variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}
				<div className="flex items-end gap-3">
					<div className="space-y-1">
						<Label htmlFor="claude-addon-quantity">Purchased prompts</Label>
						<Input
							id="claude-addon-quantity"
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
