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

import { IconCheck, IconLoader2 } from "@tabler/icons-react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { CLAUDE_ADDON_MONTHLY_USD, PLAN_KEYS, PLANS, type PlanDefinition, type PlanKey } from "@workspace/config/plans";
import { authClient } from "@workspace/lib/auth/client";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Switch } from "@workspace/ui/components/switch";
import { useEffect, useState } from "react";
import { z } from "zod";
import { buildTitle, getAppName } from "@/lib/route-head";
import { getModelDisplayName } from "@/lib/utils";
import { getPaywallStateFn, type PaywallState } from "@/server/billing";

const searchSchema = z.object({
	status: z.enum(["success"]).optional(),
});

export const Route = createFileRoute("/_authed/choose-plan")({
	validateSearch: searchSchema,
	loaderDeps: ({ search }) => ({ status: search.status }),
	// The explicit return type breaks the type-inference cycle created by this
	// loader and the app loaders redirecting into each other's typed routes.
	loader: async ({ deps }): Promise<PaywallState> => {
		const paywall = await getPaywallStateFn();
		// Already entitled (or not a cloud deployment): nothing to choose.
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

function planFeatures(plan: PlanDefinition): string[] {
	const features = [
		`${plan.maxBrands} brand${plan.maxBrands === 1 ? "" : "s"}`,
		`${plan.maxPrompts} tracked prompts`,
		plan.platformMenu.length === 1
			? `${getModelDisplayName(plan.platformMenu[0])} tracking`
			: `Choose ${plan.platformPicks} AI platforms`,
		`${plan.standardRunsPerDay} sample${plan.standardRunsPerDay === 1 ? "" : "s"} per day`,
	];
	if (plan.claudeIncluded > 0) {
		features.push(`Claude tracking on ${plan.claudeIncluded} prompts`);
	}
	if (plan.claudeAddonAvailable) {
		features.push(`Extra Claude prompts $${CLAUDE_ADDON_MONTHLY_USD}/prompt/mo`);
	}
	// The Claude lines already lengthen those cards, so their constant tail
	// collapses to one line to keep the lists close in height.
	if (plan.claudeIncluded > 0) {
		features.push("API access · Unlimited seats");
	} else {
		features.push("API access", "Unlimited seats");
	}
	return features;
}

function ChoosePlanPage() {
	const paywall = Route.useLoaderData();
	const { status } = Route.useSearch();
	const navigate = useNavigate();
	const [annual, setAnnual] = useState(false);
	const [subscribing, setSubscribing] = useState<PlanKey | null>(null);
	const [error, setError] = useState<string | null>(null);

	// Post-checkout: wait for the webhook to record the subscription.
	useEffect(() => {
		if (status !== "success") return;
		let cancelled = false;
		const poll = async () => {
			for (let i = 0; i < 30 && !cancelled; i++) {
				const state = await getPaywallStateFn();
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
	}, [status, navigate]);

	if (status === "success") {
		return (
			<div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
				<IconLoader2 className="h-8 w-8 animate-spin text-muted-foreground" />
				<h1 className="text-2xl font-bold">Activating your workspace…</h1>
				<p className="text-muted-foreground">Payment received — finishing setup. This takes a few seconds.</p>
			</div>
		);
	}

	const subscribe = async (plan: PlanKey) => {
		if (!paywall.needsPlan) return;
		setSubscribing(plan);
		setError(null);
		const origin = window.location.origin;
		const { error: upgradeError } = await authClient.subscription.upgrade({
			plan,
			annual,
			referenceId: paywall.organizationId,
			customerType: "organization",
			successUrl: `${origin}/choose-plan?status=success`,
			cancelUrl: `${origin}/choose-plan`,
			disableRedirect: false,
		});
		if (upgradeError) {
			setError(upgradeError.message ?? "Could not start checkout");
			setSubscribing(null);
		}
	};

	const isAdmin = !paywall.needsPlan || paywall.isOrgAdmin !== false;

	return (
		<div className="mx-auto max-w-6xl space-y-8 p-8">
			<div className="space-y-2 text-center">
				<h1 className="text-3xl font-bold">Choose your plan</h1>
				<p className="text-muted-foreground">
					Start tracking how AI answer engines talk about your brand. No trial — try the{" "}
					<a className="underline" href="https://demo.elmohq.com" target="_blank" rel="noopener noreferrer">
						live demo
					</a>{" "}
					or{" "}
					<a className="underline" href="https://docs.elmohq.com" target="_blank" rel="noopener noreferrer">
						self-host for free
					</a>
					.
				</p>
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
					const price = annual ? plan.annualPriceUsd : plan.monthlyPriceUsd;
					return (
						<Card key={key} className={key === "pro" ? "border-primary" : undefined}>
							<CardHeader>
								<CardTitle className="flex items-center justify-between">
									{plan.name}
									{key === "pro" && <Badge>Popular</Badge>}
								</CardTitle>
								<div>
									<span className="text-3xl font-bold">${price.toLocaleString()}</span>
									<span className="text-muted-foreground">/{annual ? "year" : "month"}</span>
								</div>
							</CardHeader>
							<CardContent className="flex-1">
								<ul className="space-y-2 text-sm">
									{planFeatures(plan).map((feature) => (
										<li key={feature} className="flex items-start gap-2">
											<IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
											{feature}
										</li>
									))}
								</ul>
							</CardContent>
							<CardFooter>
								<Button className="w-full" disabled={!isAdmin || subscribing !== null} onClick={() => subscribe(key)}>
									{subscribing === key ? <IconLoader2 className="h-4 w-4 animate-spin" /> : `Subscribe to ${plan.name}`}
								</Button>
							</CardFooter>
						</Card>
					);
				})}
			</div>

			<p className="text-center text-sm text-muted-foreground">
				Need GPT-5 Search, research-grade sampling (7×/day), SSO, or custom limits?{" "}
				<a className="underline" href="mailto:hello@elmohq.com?subject=Elmo%20Cloud%20custom%20plan">
					Talk to us about a custom plan
				</a>
				.
			</p>
		</div>
	);
}
