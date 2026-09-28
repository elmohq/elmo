import { createFileRoute } from "@tanstack/react-router";
import { premiumSlotsUsed } from "@workspace/config/plans";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { PromptCatalog } from "@/components/prompt-catalog";
import { resolvePromptCatalogQuery, validatePromptCatalogSearch } from "@/lib/prompt-catalog";
import { pageHead } from "@/lib/route-head";
import { getPremiumPoolFn } from "@/server/premium-tracking";
import { getPromptCatalogPageFn } from "@/server/prompt-catalog";

function PromptsSettingsSkeleton() {
	return (
		<div className="space-y-4">
			<div className="space-y-2">
				<Skeleton className="h-9 w-48" />
				<Skeleton className="h-5 w-80" />
			</div>
			<div className="space-y-3">
				{[0, 1, 2, 3, 4].map((n) => (
					<div key={n} className="flex items-center gap-3 p-3 border rounded-lg">
						<Skeleton className="h-5 w-5" />
						<Skeleton className="h-5 flex-1" />
						<Skeleton className="h-8 w-20" />
					</div>
				))}
			</div>
		</div>
	);
}

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/settings/prompts")({
	staticData: { crumb: "Prompts" },
	validateSearch: validatePromptCatalogSearch,
	loaderDeps: ({ search }) => resolvePromptCatalogQuery(search),
	loader: async ({ context, deps }) => {
		const [page, premiumPool] = await Promise.all([
			getPromptCatalogPageFn({ data: { brandId: context.brandId, ...deps } }),
			getPremiumPoolFn({ data: { brandId: context.brandId } }),
		]);

		// The pool is org-wide but the editor only sees this page, so hand it the
		// share spent everywhere else — other brands and this brand's other
		// pages — and let it count the rows on screen live.
		const spentHere = premiumSlotsUsed(page.rows);
		return {
			page,
			search: deps,
			premium: premiumPool.available
				? {
						total: premiumPool.total,
						assignedElsewhere: Math.max(0, premiumPool.assigned - spentHere),
					}
				: undefined,
		};
	},
	head: pageHead({ description: "Add, edit, or remove tracked prompts." }),
	pendingComponent: PromptsSettingsSkeleton,
	component: PromptsSettingsPage,
});

function PromptsSettingsPage() {
	const { page, search, premium } = Route.useLoaderData();
	const { brandId } = Route.useRouteContext();

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-3xl font-bold tracking-tight">Prompts</h1>
				<p className="text-muted-foreground">Add, edit, or remove your brand tracking keywords and prompts</p>
			</div>
			<PromptCatalog brandId={brandId} page={page} search={search} premium={premium} />
		</div>
	);
}
