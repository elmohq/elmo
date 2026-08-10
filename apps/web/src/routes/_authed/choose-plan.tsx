/**
 * /choose-plan — checkout-first cloud onboarding.
 *
 * An authenticated org with no active subscription lands here (redirected from
 * the app routes) and can't reach anything else until Stripe Checkout
 * completes. The plan catalog renders straight from packages/config/plans —
 * pricing changes never touch this file. After Checkout returns
 * (?status=success) the page polls until the webhook lands, then enters the
 * app.
 */

import { IconLoader2 } from "@tabler/icons-react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { PLAN_KEYS, PLANS, type PlanKey } from "@workspace/config/plans";
import { authClient } from "@workspace/lib/auth/client";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Switch } from "@workspace/ui/components/switch";
import { useEffect, useState } from "react";
import { z } from "zod";
import { PlanCard } from "@/components/plan-card";
import { buildTitle, getAppName } from "@/lib/route-head";
import { getPaywallStateFn, type PaywallRequired, type PaywallState } from "@/server/billing";

const searchSchema = z.object({
	status: z.enum(["success"]).optional(),
	/**
	 * Which workspace is being subscribed. Carried by whichever gate redirected
	 * here so checkout bills the workspace the user was actually blocked on,
	 * not whichever of their memberships happens to be oldest.
	 */
	org: z.string().optional(),
});

export const Route = createFileRoute("/_authed/choose-plan")({
	validateSearch: searchSchema,
	loaderDeps: ({ search }) => ({ status: search.status, org: search.org }),
	// The explicit return type breaks the type-inference cycle created by this
	// loader and the app loaders redirecting into each other's typed routes.
	loader: async ({ deps }): Promise<PaywallState> => {
		const paywall = await getPaywallStateFn({ data: { organizationId: deps.org } });
		// Already entitled (or not a cloud deployment): nothing to choose. Asking
		// about the same org the gate asked about is what keeps this from bouncing
		// the user back and forth with a gate that disagrees.
		if (!paywall.needsPlan && deps.status !== "success") {
			throw redirect({ to: "/app" });
		}
		return paywall;
	},
	head: ({ match }) => ({
		meta: [{ title: buildTitle("Choose a plan", { appName: getAppName(match) }) }],
	}),
	component: ChoosePlanPage,
});

function ChoosePlanPage() {
	const paywall = Route.useLoaderData();
	const { status, org } = Route.useSearch();

	if (status === "success") return <ActivatingWorkspace organizationId={org} />;
	// The loader redirects an entitled org away unless it is returning from
	// checkout, which the branch above already handled.
	if (!paywall.needsPlan) return null;
	return <PlanPicker paywall={paywall} />;
}

/** Post-checkout: wait for the Stripe webhook to record the subscription. */
function ActivatingWorkspace({ organizationId }: { organizationId?: string }) {
	const navigate = useNavigate();

	useEffect(() => {
		let cancelled = false;
		const poll = async () => {
			for (let i = 0; i < 30 && !cancelled; i++) {
				// Poll the org that was just paid for: another unsubscribed workspace
				// would otherwise keep the user-level check saying "still needs a plan".
				const state = await getPaywallStateFn({ data: { organizationId } });
				if (!state.needsPlan) {
					navigate({ to: "/app" });
					return;
				}
				await new Promise((resolve) => setTimeout(resolve, 2000));
			}
		};
		void poll();
		return () => {
			cancelled = true;
		};
	}, [navigate, organizationId]);

	return (
		<div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
			<IconLoader2 className="h-8 w-8 animate-spin text-muted-foreground" />
			<h1 className="text-2xl font-bold">Activating your workspace…</h1>
			<p className="text-muted-foreground">Payment received — finishing setup. This takes a few seconds.</p>
		</div>
	);
}

function PlanPicker({ paywall }: { paywall: PaywallRequired }) {
	const [annual, setAnnual] = useState(false);
	const [subscribing, setSubscribing] = useState<PlanKey | null>(null);
	const [error, setError] = useState<string | null>(null);
	const isAdmin = paywall.isOrgAdmin;

	const subscribe = async (plan: PlanKey) => {
		setSubscribing(plan);
		setError(null);
		const origin = window.location.origin;
		const { error: upgradeError } = await authClient.subscription.upgrade({
			plan,
			annual,
			referenceId: paywall.organizationId,
			customerType: "organization",
			successUrl: `${origin}/choose-plan?status=success&org=${encodeURIComponent(paywall.organizationId)}`,
			cancelUrl: `${origin}/choose-plan?org=${encodeURIComponent(paywall.organizationId)}`,
			disableRedirect: false,
		});
		if (upgradeError) {
			setError(upgradeError.message ?? "Could not start checkout");
			setSubscribing(null);
		}
	};

	return (
		<div className="mx-auto max-w-6xl space-y-8 p-8">
			<div className="space-y-2 text-center">
				<h1 className="text-3xl font-bold">Choose your plan</h1>
				<p className="text-muted-foreground">Start tracking how AI answer engines talk about your brand.</p>
				<div className="flex items-center justify-center gap-3 pt-2">
					<span className={annual ? "text-muted-foreground" : "font-medium"}>Monthly</span>
					<Switch checked={annual} onCheckedChange={setAnnual} aria-label="Annual billing" />
					<span className={annual ? "font-medium" : "text-muted-foreground"}>
						Annual <Badge variant="secondary">2 months free</Badge>
					</span>
				</div>
			</div>

			{!isAdmin && (
				<Alert>
					<AlertDescription>
						Only a workspace admin can choose a plan. Ask the person who created this workspace.
					</AlertDescription>
				</Alert>
			)}
			{error && (
				<Alert variant="destructive">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
				{PLAN_KEYS.map((key) => {
					const plan = PLANS[key];
					return (
						<PlanCard
							key={key}
							plan={plan}
							priceUsd={annual ? plan.annualPriceUsd : plan.monthlyPriceUsd}
							priceSuffix={annual ? "/year" : "/month"}
							highlighted={key === "pro"}
							action={
								<Button className="w-full" disabled={!isAdmin || subscribing !== null} onClick={() => subscribe(key)}>
									{subscribing === key ? <IconLoader2 className="h-4 w-4 animate-spin" /> : `Subscribe to ${plan.name}`}
								</Button>
							}
						/>
					);
				})}
			</div>

			<p className="text-center text-sm text-muted-foreground">
				Need more brands, any other models, higher numbers of samples, SSO, white label, or custom limits?{" "}
				<a className="underline" href="mailto:hello@elmohq.com?subject=Elmo%20Cloud%20custom%20plan">
					Talk to us about a custom plan
				</a>
				.
			</p>
		</div>
	);
}
