import { useLoaderData } from "@tanstack/react-router";
import type { PublicCloudCatalog, PublicCloudPlan } from "@/lib/cloud-plans";
import type { LoaderData } from "@/routes/docs/$";

interface ComparisonRow {
	label: string;
	value: (plan: PublicCloudPlan, catalog: PublicCloudCatalog) => string;
	custom: string;
}

const comparisonRows: ComparisonRow[] = [
	{
		label: "Monthly",
		value: (plan) => `${plan.monthlyPrice}/month`,
		custom: "Contract",
	},
	{
		label: "Annual",
		value: (plan) => `${plan.annualPrice}/year`,
		custom: "Contract",
	},
	{
		label: "Brands",
		value: (plan) => plan.brandSlots.toString(),
		custom: "Custom",
	},
	{
		label: "Tracked prompts",
		value: (plan) => plan.promptSlots.toString(),
		custom: "Custom",
	},
	{
		label: "Standard platforms",
		value: (plan) => plan.platformSelection,
		custom: "All or custom",
	},
	{
		label: "Standard sampling",
		value: (plan) => `${plan.standardSamplesPerDay}× daily`,
		custom: "Custom, up to 7× daily",
	},
	{
		label: "Claude prompts",
		value: (plan) => (plan.claudePromptSlots > 0 ? `${plan.claudePromptSlots}, daily` : "—"),
		custom: "Custom",
	},
	{
		label: "Extra Claude prompts",
		value: (plan, catalog) => (plan.allowsClaudeAddon ? `${catalog.claudeAddon.monthlyPrice}/month each` : "—"),
		custom: "Custom",
	},
	{
		label: "API access",
		value: () => "Included",
		custom: "Included",
	},
	{
		label: "Seats",
		value: () => "Unlimited",
		custom: "Unlimited",
	},
];

export function CloudPlanTable() {
	const { cloudCatalog } = useLoaderData({ from: "/docs/$" }) as LoaderData;
	return (
		<div className="my-6 overflow-x-auto rounded-lg border border-fd-border">
			<table className="m-0 min-w-[880px] border-collapse text-sm">
				<thead>
					<tr className="bg-fd-muted/50">
						<th className="min-w-40 px-4 py-3 text-left font-medium">Plan</th>
						{cloudCatalog.plans.map((plan) => (
							<th key={plan.id} className="min-w-36 px-4 py-3 text-left font-medium">
								{plan.displayName}
							</th>
						))}
						<th className="min-w-36 px-4 py-3 text-left font-medium">Custom</th>
					</tr>
				</thead>
				<tbody>
					{comparisonRows.map((row) => (
						<tr key={row.label} className="border-t border-fd-border align-top">
							<th className="px-4 py-3 text-left font-medium">{row.label}</th>
							{cloudCatalog.plans.map((plan) => (
								<td key={plan.id} className="px-4 py-3 text-fd-muted-foreground">
									{row.value(plan, cloudCatalog)}
								</td>
							))}
							<td className="px-4 py-3 text-fd-muted-foreground">{row.custom}</td>
						</tr>
					))}
				</tbody>
			</table>
			<p className="m-0 border-t border-fd-border bg-fd-muted/30 px-4 py-3 text-xs text-fd-muted-foreground">
				Annual prices include two months free. Annual Claude add-on capacity is {cloudCatalog.claudeAddon.annualPrice}{" "}
				per assigned prompt per year.
			</p>
		</div>
	);
}
