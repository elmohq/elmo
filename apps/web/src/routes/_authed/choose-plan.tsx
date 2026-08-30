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

import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import type { PlanKey } from "@workspace/config/plans";
import { authClient } from "@workspace/lib/auth/client";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Spinner } from "@workspace/ui/components/spinner";
import { Switch } from "@workspace/ui/components/switch";
import { useEffect, useState } from "react";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { AppSidebar } from "@/components/app-sidebar";
import { PlanComparison } from "@/components/plan-comparison";
import { SiteHeader } from "@/components/site-header";
import { pageHead } from "@/lib/route-head";
import { getPaywallStateFn, type PaywallRequired, type PaywallState } from "@/server/billing";

const searchSchema = z.object({
	status: z.enum(["success"]).optional(),
	org: z.string().optional(),
});

export const Route = createFileRoute("/_authed/choose-plan")({
	staticData: { crumb: "Choose a plan" },
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
	head: pageHead({ description: "Pick a plan to start tracking how AI answer engines talk about your brand." }),
	component: ChoosePlanPage,
});

function ChoosePlanPage() {
	const paywall = Route.useLoaderData();
	const { status, org } = Route.useSearch();

	// The loader redirects an entitled org away unless it is returning from
	// checkout, which the first branch handles.
	const body =
		status === "success" ? (
			<ActivatingOrganization organizationId={org} />
		) : paywall.needsPlan ? (
			<PlanPicker paywall={paywall} />
		) : null;

	// The app's own shell, minus everywhere it could take you: a customer who
	// cannot get past this page still needs to see whose product it is, which
	// account they are signed into, and how to sign out of it — most of all the
	// non-admin who is told to go ask someone else.
	return (
		<AppShell sidebar={<AppSidebar scope="account" />} header={<SiteHeader />}>
			<div className="flex flex-1 flex-col">{body}</div>
		</AppShell>
	);
}

/** Post-checkout: wait for the Stripe webhook to record the subscription. */
function ActivatingOrganization({ organizationId }: { organizationId?: string }) {
	const navigate = useNavigate();

	useEffect(() => {
		let cancelled = false;
		const poll = async () => {
			for (let i = 0; i < 30 && !cancelled; i++) {
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
			<Spinner className="size-8 text-muted-foreground" />
			<h1 className="text-2xl font-bold">Activating your organization…</h1>
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
						Only an organization admin can choose a plan. Ask the person who created this organization.
					</AlertDescription>
				</Alert>
			)}
			{error && (
				<Alert variant="destructive">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			<PlanComparison
				annual={annual}
				highlightPlan="pro"
				renderAction={(plan) => (
					<Button
						className="w-full"
						size="sm"
						// The column header carries the plan name; a screen reader
						// reaching the button on its own would hear four of "Subscribe".
						aria-label={`Subscribe to ${plan.name}`}
						disabled={!isAdmin || subscribing !== null}
						onClick={() => subscribe(plan.key)}
					>
						{subscribing === plan.key ? <Spinner /> : "Subscribe"}
					</Button>
				)}
			/>

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
