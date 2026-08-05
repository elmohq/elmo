"use client";

import { ArrowRight, ArrowUpRight, Check } from "lucide-react";
import { useState } from "react";
import { CLOUD_SALES_EMAIL, CLOUD_SIGNUP_URL, LIVE_DEMO_URL, SELF_HOSTED_DOCS_URL } from "@/lib/cloud-links";
import type { PublicCloudCatalog, PublicCloudPlan } from "@/lib/cloud-plans";
import { externalRel } from "@/lib/external-link";
import { ContactForm } from "./contact-form";

type BillingInterval = "monthly" | "annual";

const customFeatures = [
	"Custom brand and prompt limits",
	"All standard and custom targets",
	"Up to 7× daily standard sampling",
	"GPT-5 Search and web-search API targets",
	"Custom Claude capacity and cadence",
	"Elmo API access",
	"Unlimited seats with SSO",
];

function planFeatures(plan: PublicCloudPlan): string[] {
	return [
		`${plan.brandSlots} brand${plan.brandSlots === 1 ? "" : "s"}`,
		`${plan.promptSlots} tracked prompts`,
		plan.platformSelection,
		`${plan.standardSamplesPerDay}× daily standard sampling`,
		plan.claudePromptSlots > 0 ? `${plan.claudePromptSlots} daily Claude prompts` : "Claude tracking not included",
		"Elmo API access",
		"Unlimited seats",
	];
}

function PlanFeatureList({ features }: { features: string[] }) {
	return (
		<ul className="mt-6 space-y-2.5 text-sm text-zinc-700">
			{features.map((feature) => (
				<li key={feature} className="flex items-start gap-2">
					<Check className="mt-0.5 size-3.5 shrink-0 text-blue-600" strokeWidth={3} />
					<span>{feature}</span>
				</li>
			))}
		</ul>
	);
}

function CloudPlanCards({ interval, plans }: { interval: BillingInterval; plans: PublicCloudPlan[] }) {
	return (
		<div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
			{plans.map((plan) => {
				const annual = interval === "annual";
				const price = annual ? plan.annualPrice : plan.monthlyPrice;
				const featured = plan.id === "pro";
				return (
					<div
						key={plan.id}
						className={`flex flex-col rounded-lg border bg-white p-5 ${
							featured ? "border-blue-600 shadow-lg shadow-blue-600/10" : "border-zinc-200"
						}`}
					>
						<div className="flex items-center justify-between gap-2">
							<h3 className="text-xl font-semibold tracking-tight text-zinc-950">{plan.displayName}</h3>
							{featured && (
								<span className="rounded-full bg-blue-50 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-blue-700">
									Popular
								</span>
							)}
						</div>
						<div className="mt-5 border-y border-zinc-200 py-4">
							<div className="flex items-baseline gap-1.5">
								<span className="text-3xl font-semibold tracking-tight text-zinc-950 tabular-nums">{price}</span>
								<span className="text-xs text-zinc-500">/ {annual ? "year" : "month"}</span>
							</div>
							<p className="mt-1 min-h-4 text-xs text-zinc-500">{annual ? "Two months free" : "Billed monthly"}</p>
						</div>
						<div className="flex flex-1 flex-col justify-between">
							<PlanFeatureList features={planFeatures(plan)} />
							<a
								href={CLOUD_SIGNUP_URL}
								className="mt-7 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 text-sm font-medium text-white ring-1 ring-blue-600 hover:bg-blue-700"
							>
								Choose {plan.displayName}
								<ArrowRight className="size-3.5" />
							</a>
						</div>
					</div>
				);
			})}

			<div className="flex flex-col rounded-lg border border-zinc-900 bg-zinc-950 p-5 text-white sm:col-span-2 xl:col-span-1">
				<h3 className="text-xl font-semibold tracking-tight">Custom</h3>
				<div className="mt-5 border-y border-zinc-700 py-4">
					<span className="text-3xl font-semibold tracking-tight">Let's talk</span>
					<p className="mt-1 text-xs text-zinc-400">Contract billing</p>
				</div>
				<div className="flex flex-1 flex-col justify-between">
					<ul className="mt-6 space-y-2.5 text-sm text-zinc-300">
						{customFeatures.map((feature) => (
							<li key={feature} className="flex items-start gap-2">
								<Check className="mt-0.5 size-3.5 shrink-0 text-blue-400" strokeWidth={3} />
								<span>{feature}</span>
							</li>
						))}
					</ul>
					<a
						href={`mailto:${CLOUD_SALES_EMAIL}?subject=Elmo%20Cloud%20custom%20plan`}
						className="mt-7 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-white px-3 text-sm font-medium text-zinc-950 hover:bg-zinc-100"
					>
						Contact sales
						<ArrowRight className="size-3.5" />
					</a>
				</div>
			</div>
		</div>
	);
}

function DeploymentOptions() {
	return (
		<div className="mt-16 border-t border-zinc-200 pt-12">
			<p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">/ THREE WAYS TO RUN ELMO</p>
			<div className="mt-5 grid gap-px overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200 md:grid-cols-3">
				<div className="bg-white p-6">
					<p className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500">Self-hosted</p>
					<h3 className="mt-3 text-xl font-semibold text-zinc-950">Free and open source</h3>
					<p className="mt-2 text-sm text-zinc-600">
						Run the full MIT-licensed product on your infrastructure and bring your own provider accounts.
					</p>
					<a
						href={SELF_HOSTED_DOCS_URL}
						className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-blue-700"
					>
						Self-host Elmo <ArrowRight className="size-3.5" />
					</a>
				</div>
				<div className="bg-white p-6">
					<p className="font-mono text-[11px] uppercase tracking-[0.16em] text-blue-700">Cloud</p>
					<h3 className="mt-3 text-xl font-semibold text-zinc-950">Managed from $29/month</h3>
					<p className="mt-2 text-sm text-zinc-600">
						Elmo runs the infrastructure and provider integrations. Start tracking without maintaining a stack.
					</p>
					<a
						href={CLOUD_SIGNUP_URL}
						className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-blue-700"
					>
						Start in Cloud <ArrowRight className="size-3.5" />
					</a>
				</div>
				<div className="bg-white p-6">
					<p className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500">White label</p>
					<h3 className="mt-3 text-xl font-semibold text-zinc-950">Enterprise deployment</h3>
					<p className="mt-2 text-sm text-zinc-600">
						Offer Elmo under your own brand with a custom domain, SSO, and a dedicated deployment.
					</p>
					<div className="mt-5 max-w-40 [&_button]:h-8 [&_button]:text-sm">
						<ContactForm source="pricing-deployments" />
					</div>
				</div>
			</div>
		</div>
	);
}

export function Pricing({ catalog }: { catalog: PublicCloudCatalog }) {
	const [interval, setInterval] = useState<BillingInterval>("monthly");

	return (
		<section id="pricing" className="border-b border-zinc-200 bg-white">
			<div className="mx-auto max-w-7xl px-4 py-16 md:px-6 lg:py-24">
				<div className="flex flex-wrap items-end justify-between gap-6">
					<div>
						<p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">/ ELMO CLOUD</p>
						<h2 className="mt-4 max-w-[24ch] text-4xl font-semibold leading-[1.05] tracking-tight text-balance text-zinc-950 md:text-5xl">
							Reliable AI visibility without the infrastructure work.
						</h2>
						<p className="mt-4 max-w-2xl text-pretty text-zinc-600">
							Every plan includes unlimited seats and API access. Annual billing includes two months free.
						</p>
					</div>
					<fieldset className="flex rounded-lg border border-zinc-200 bg-zinc-50 p-1">
						<legend className="sr-only">Billing interval</legend>
						<button
							type="button"
							aria-pressed={interval === "monthly"}
							onClick={() => setInterval("monthly")}
							className={`h-8 rounded-md px-3 text-sm font-medium ${
								interval === "monthly" ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-600 hover:text-zinc-950"
							}`}
						>
							Monthly
						</button>
						<button
							type="button"
							aria-pressed={interval === "annual"}
							onClick={() => setInterval("annual")}
							className={`h-8 rounded-md px-3 text-sm font-medium ${
								interval === "annual" ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-600 hover:text-zinc-950"
							}`}
						>
							Annual <span className="text-emerald-700">−2 months</span>
						</button>
					</fieldset>
				</div>

				<CloudPlanCards interval={interval} plans={catalog.plans} />

				<div className="mt-8 grid gap-4 lg:grid-cols-2">
					<div className="rounded-lg border border-zinc-200 bg-zinc-50 p-6">
						<h3 className="text-lg font-semibold text-zinc-950">Choose from the standard platform menu</h3>
						<p className="mt-2 text-sm text-zinc-600">
							Basic, Pro, and Business select four platforms per brand. Starter tracks ChatGPT only.
						</p>
						<div className="mt-4 flex flex-wrap gap-2">
							{catalog.standardPlatformNames.map((platform) => (
								<span
									key={platform}
									className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-700"
								>
									{platform}
								</span>
							))}
						</div>
					</div>
					<div className="rounded-lg border border-zinc-200 bg-zinc-50 p-6">
						<h3 className="text-lg font-semibold text-zinc-950">Measure a distribution, not one lucky answer</h3>
						<p className="mt-2 text-sm text-zinc-600">
							AI answers vary between runs. Basic, Pro, and Business sample each standard platform four times daily;
							Custom supports up to seven daily samples and custom replication.
						</p>
						<a
							href="https://arxiv.org/abs/2604.07585"
							target="_blank"
							rel={externalRel("https://arxiv.org/abs/2604.07585")}
							className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-blue-700"
						>
							Read the repeated-measurement research <ArrowUpRight className="size-3.5" />
						</a>
					</div>
				</div>

				<div className="mt-8 flex flex-col gap-4 rounded-lg border border-blue-200 bg-blue-50 p-6 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<h3 className="font-semibold text-zinc-950">Evaluate Elmo before you subscribe</h3>
						<p className="mt-1 text-sm text-zinc-600">
							Cloud has no trial. Explore populated data in the live demo or run the complete open-source product
							yourself.
						</p>
					</div>
					<div className="flex shrink-0 flex-wrap gap-2">
						<a
							href={LIVE_DEMO_URL}
							target="_blank"
							rel={externalRel(LIVE_DEMO_URL)}
							className="inline-flex h-9 items-center gap-1.5 rounded-md bg-white px-3 text-sm font-medium text-zinc-900 ring-1 ring-zinc-200 hover:bg-zinc-50"
						>
							Live demo <ArrowUpRight className="size-3.5" />
						</a>
						<a
							href={SELF_HOSTED_DOCS_URL}
							className="inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700"
						>
							Self-host free <ArrowRight className="size-3.5" />
						</a>
					</div>
				</div>

				<p className="mt-4 text-xs text-zinc-500">
					Extra Claude capacity is available on Pro and Business for {catalog.claudeAddon.monthlyPrice} per assigned
					prompt per month. Claude runs daily in either base-model or native web-search mode.
				</p>

				<DeploymentOptions />
			</div>
		</section>
	);
}
