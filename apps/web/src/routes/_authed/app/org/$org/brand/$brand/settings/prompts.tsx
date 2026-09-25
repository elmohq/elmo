import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { premiumSlotsUsed } from "@workspace/config/plans";
import { db } from "@workspace/lib/db/db";
import { brands, prompts } from "@workspace/lib/db/schema";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { PromptsEditor } from "@/components/prompts-editor";
import { useBrandId } from "@/hooks/use-brand-id";
import { requireAuthSession, requireBrandAccess } from "@/lib/auth/helpers";
import { pageHead } from "@/lib/route-head";
import { getPremiumPoolFn } from "@/server/premium-tracking";

const getPromptsForEditing = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string() }))
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		await requireBrandAccess(session.user.id, data.brandId);

		const [brandPrompts, [brand]] = await Promise.all([
			db
				.select()
				.from(prompts)
				.where(eq(prompts.brandId, data.brandId))
				.orderBy(prompts.value, desc(prompts.enabled), prompts.id),
			db
				.select({
					name: brands.name,
					website: brands.website,
					aliases: brands.aliases,
					additionalDomains: brands.additionalDomains,
				})
				.from(brands)
				.where(eq(brands.id, data.brandId))
				.limit(1),
		]);
		if (!brand) throw new Error("Brand not found");

		return { prompts: brandPrompts, brand };
	});

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
	loader: async ({ context }) => {
		const [{ prompts: brandPrompts, brand }, premiumPool] = await Promise.all([
			getPromptsForEditing({ data: { brandId: context.brandId } }),
			getPremiumPoolFn({ data: { brandId: context.brandId } }),
		]);

		// The pool is org-wide but the editor only sees this brand, so hand it the
		// share spent by the org's other brands and let it count this list live.
		const spentHere = premiumSlotsUsed(brandPrompts);
		return {
			prompts: brandPrompts,
			brand,
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
	const { prompts: brandPrompts, brand, premium } = Route.useLoaderData();
	const brandId = useBrandId();

	return (
		<PromptsEditor
			initialPrompts={brandPrompts}
			brandId={brandId}
			brand={brand}
			pageTitle="Prompts"
			pageDescription="Add, edit, or remove your brand tracking keywords and prompts"
			premium={premium}
		/>
	);
}
