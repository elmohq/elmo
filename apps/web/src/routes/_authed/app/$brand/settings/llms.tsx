/**
 * /app/$brand/settings/llms - LLM configuration page
 *
 * Which platforms a brand is tracked against, grouped by what each group tells
 * you: a scraped engine shows what a visitor sees, an ungrounded API call shows
 * what a model already believes, and a grounded one shows what it finds and
 * cites. Grounded calls cost roughly ten times an ungrounded one, so in cloud
 * they are metered per prompt instead of picked per brand.
 *
 * Picks are buffered and saved together from the bar at the bottom, matching the
 * prompts editor. The server functions hold the real limits; this page only
 * renders them.
 */

import { IconArrowUpRight, IconExternalLink } from "@tabler/icons-react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { PROVIDERS_DOCS_URL } from "@workspace/config/constants";
import { getModelMeta } from "@workspace/config/models";
import { PREMIUM_MODELS, PREMIUM_RUNS_PER_DAY, premiumModelLabel } from "@workspace/config/plans";
import { ModelIcon } from "@workspace/ui/brand/model-icon";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { buttonVariants } from "@workspace/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { cn } from "@workspace/ui/lib/utils";
import { type ReactNode, useState } from "react";
import {
	formatUsd,
	PlatformList,
	PlatformOperatorDetail,
	PlatformPicker,
	projectSelectionCostUsd,
} from "@/components/platform-picker";
import { UnsavedChangesBar } from "@/components/unsaved-changes-bar";
import { groupPlatformOptions, type PlatformGroup, platformGroupCopy, platformGroupId } from "@/lib/platform-groups";
import { buildTitle, getAppName, getBrandName } from "@/lib/route-head";
import { getModelPickerStateFn, type ModelPickerState, updateEnabledModelsFn } from "@/server/platform-picks";
import { getPremiumPoolFn, type PremiumPool } from "@/server/premium-tracking";

export const Route = createFileRoute("/_authed/app/$brand/settings/llms")({
	loader: async ({ params }): Promise<{ picker: ModelPickerState; premium: PremiumPool }> => {
		const [picker, premium] = await Promise.all([
			getModelPickerStateFn({ data: { brandId: params.brand } }),
			getPremiumPoolFn({ data: { brandId: params.brand } }),
		]);
		return { picker, premium };
	},
	head: ({ matches, match }) => {
		const appName = getAppName(match);
		const brandName = getBrandName(matches);
		return {
			meta: [
				{ title: buildTitle("LLMs", { appName, brandName }) },
				{ name: "description", content: "Choose which AI models this brand is tracked against." },
			],
		};
	},
	component: LlmsSettingsPage,
});

function LlmsSettingsPage() {
	const { picker, premium } = Route.useLoaderData();

	return (
		<div className="max-w-6xl space-y-8">
			<div>
				<h1 className="text-3xl font-bold">LLMs</h1>
				<p className="text-muted-foreground">
					Your prompts are evaluated against these AI models to track how your brand appears across different types of
					AI search.
				</p>
			</div>

			<PlatformSection picker={picker} />

			{premium.available && <PremiumApiPool premium={premium} />}
			{picker.unconfiguredPlatforms.length > 0 && <AddPlatformsCard platforms={picker.unconfiguredPlatforms} />}
		</div>
	);
}

/** Which of the three shapes this deployment and plan leave: a picker, or one of
 *  the two reports — nothing configured, or nothing for the viewer to decide. */
function PlatformSection({ picker }: { picker: ModelPickerState }) {
	if (picker.available.length === 0) return <NoPlatformsCard />;
	if (!picker.editable) return <TrackedPlatforms picker={picker} />;
	// A one-platform plan has nothing to choose, so it reports instead.
	if (picker.planLimits?.platformPicks === 1 && picker.available.length === 1) {
		return <SinglePlatformSummary picker={picker} />;
	}
	return <PlatformGroups picker={picker} />;
}

function NoPlatformsCard() {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Tracked platforms</CardTitle>
			</CardHeader>
			<CardContent>
				<p className="text-sm text-muted-foreground">
					No models are configured on this deployment. Set <code className="font-mono text-xs">SCRAPE_TARGETS</code>.
				</p>
			</CardContent>
		</Card>
	);
}

/**
 * The same tiers with no checkboxes, for the modes where the picks are not the
 * viewer's to make: demo refuses every write, and in whitelabel the agency
 * decides what its customers are tracked on. Only the platforms actually tracked
 * are listed — the rest would read as an offer.
 */
function TrackedPlatforms({ picker }: { picker: ModelPickerState }) {
	const tracked = new Set(picker.enabledModels ?? picker.available.map((option) => option.model));
	const groups = groupPlatformOptions(picker.available.filter((option) => tracked.has(option.model)));

	if (groups.length === 0) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Tracked platforms</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground">This brand is not tracked on any platform yet.</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="space-y-4">
			<PlatformTierCard groups={groups} renderGroup={(group) => <PlatformList options={group.options} />} />
			<p className="text-sm text-muted-foreground">
				Which platforms this brand is tracked on is set by whoever runs this deployment.
			</p>
		</div>
	);
}

/**
 * One card, divided: the tiers answer different questions but spend the same
 * budget, and separate cards read as separate allowances.
 */
function PlatformTierCard({
	groups,
	renderGroup,
}: {
	groups: PlatformGroup[];
	renderGroup: (group: PlatformGroup) => ReactNode;
}) {
	return (
		<Card className="gap-0 py-0">
			{groups.map((group, index) => (
				// Same vertical rhythm a Card gives its own header and content, so
				// every tier sits the same distance from its description as the
				// premium card below does.
				<div key={group.id} className={cn("flex flex-col gap-6 py-6", index > 0 && "border-t")}>
					<CardHeader>
						<CardTitle>{group.title}</CardTitle>
						<CardDescription>{group.description}</CardDescription>
					</CardHeader>
					<CardContent>{renderGroup(group)}</CardContent>
				</div>
			))}
		</Card>
	);
}

/**
 * The tiers as a choice: a buffered selection, what it would cost or spend of
 * the plan's budget, and the bar that commits it.
 */
function PlatformGroups({ picker }: { picker: ModelPickerState }) {
	const { brand: brandId } = Route.useParams();
	const router = useRouter();

	// The server resolves what the brand is actually tracked on, so null only
	// reaches here unmetered, where it means "everything configured".
	const stored = new Set(picker.enabledModels ?? picker.available.map((m) => m.model));
	const [selected, setSelected] = useState<Set<string>>(stored);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const groups = groupPlatformOptions(picker.available);
	const limit = picker.planLimits?.platformPicks ?? null;
	const costBasis = picker.costBasis;
	const spend = costBasis
		? {
				saved: projectSelectionCostUsd(picker.available, stored, costBasis),
				next: projectSelectionCostUsd(picker.available, selected, costBasis),
			}
		: null;
	const overLimit = limit !== null && selected.size > limit;
	const isDirty = selected.size !== stored.size || [...selected].some((m) => !stored.has(m));

	const save = async () => {
		setSaving(true);
		setError(null);
		try {
			await updateEnabledModelsFn({ data: { brandId, models: [...selected] } });
			await router.invalidate();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Could not save platform picks");
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="space-y-4">
			{/* Self-hosted only: the operator pays these bills, and the figure that
			    decides a pick is what the whole selection costs, not one row of it. */}
			{spend && costBasis && (
				<div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 px-4 py-3">
					<p className="text-sm text-muted-foreground">
						Estimated provider spend for this brand: {costBasis.enabledPrompts} tracked prompt
						{costBasis.enabledPrompts === 1 ? "" : "s"} sampled {costBasis.runsPerDay}×/day across the platforms below.
					</p>
					<Badge variant="secondary" className="font-mono tabular-nums">
						≈{formatUsd(spend.saved)}/mo
					</Badge>
				</div>
			)}

			{limit !== null && (
				<div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-4 py-3">
					<p className="text-sm text-muted-foreground">
						Your plan tracks up to {limit} platform{limit === 1 ? "" : "s"} for this brand, in any combination below.
						Changes apply from the next sampling cycle.
					</p>
					<Badge variant={overLimit ? "destructive" : "secondary"}>
						{selected.size} / {limit} picks
					</Badge>
				</div>
			)}

			<PlatformTierCard
				groups={groups}
				renderGroup={(group) => (
					<PlatformPicker
						options={group.options}
						selected={selected}
						onSelectedChange={setSelected}
						limit={limit}
						disabled={saving}
					/>
				)}
			/>

			{picker.upgradeOptions.length > 0 && <UpgradePanel options={picker.upgradeOptions} brandId={brandId} />}

			{selected.size === 0 && (
				<Alert variant="destructive">
					<AlertDescription>Pick at least one platform — a brand with none is not tracked.</AlertDescription>
				</Alert>
			)}
			{overLimit && (
				<Alert variant="destructive">
					<AlertDescription>
						That is {selected.size - (limit ?? 0)} more than your plan allows. Clear some, or upgrade.
					</AlertDescription>
				</Alert>
			)}

			<UnsavedChangesBar
				isDirty={isDirty && selected.size > 0 && !overLimit}
				isSaving={saving}
				summary={summarizeSelection(selected.size, spend)}
				error={error}
				onSave={save}
				onDiscard={() => {
					setSelected(stored);
					setError(null);
				}}
			/>
		</div>
	);
}

/** What the bar says: how many platforms, and where saving leaves the bill. */
function summarizeSelection(count: number, spend: { saved: number; next: number } | null): string {
	const platforms = `${count} platform${count === 1 ? "" : "s"} selected`;
	if (!spend) return platforms;
	const direction = spend.next > spend.saved ? "up from" : spend.next < spend.saved ? "down from" : "unchanged from";
	return `${platforms} · ≈${formatUsd(spend.next)}/mo, ${direction} ${formatUsd(spend.saved)}`;
}

/**
 * What a higher plan would add, in the same tiers as the cards above. A single
 * wrapped sentence of platform names was unreadable once a plan was missing more
 * than a couple, so each name is its own chip and each tier its own row.
 */
function UpgradePanel({ options, brandId }: { options: ModelPickerState["upgradeOptions"]; brandId: string }) {
	return (
		<div className="space-y-3 rounded-md border border-dashed p-4">
			<p className="text-sm font-medium">Upgrade to track more platforms</p>
			<div className="space-y-2.5">
				{groupPlatformOptions(options).map((group) => (
					<div key={group.id} className="space-y-1.5">
						<p className="text-xs text-muted-foreground">{group.title}</p>
						<div className="flex flex-wrap gap-1.5">
							{group.options.map((option) => (
								<span
									key={option.model}
									className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs text-muted-foreground"
								>
									<ModelIcon iconId={getModelMeta(option.model).iconId} className="size-3.5" />
									{getModelMeta(option.model).label}
								</span>
							))}
						</div>
					</div>
				))}
			</div>
			<Link
				to="/app/$brand/settings/billing"
				params={{ brand: brandId }}
				className={buttonVariants({ variant: "outline", size: "sm" })}
			>
				Compare plans
				<IconArrowUpRight className="h-4 w-4" />
			</Link>
		</div>
	);
}

/**
 * A plan with a single platform has nothing to choose, so it states what is
 * tracked and what an upgrade would add.
 */
function SinglePlatformSummary({ picker }: { picker: ModelPickerState }) {
	const { brand: brandId } = Route.useParams();
	const option = picker.available[0];
	const copy = platformGroupCopy(platformGroupId(option));

	return (
		<Card>
			<CardHeader>
				<CardTitle>{copy.title}</CardTitle>
				<CardDescription>{copy.description}</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex items-center gap-3 rounded-md border p-3">
					<ModelIcon iconId={getModelMeta(option.model).iconId} className="size-5" />
					<span className="flex-1 text-sm font-medium">{getModelMeta(option.model).label}</span>
					<PlatformOperatorDetail option={option} />
				</div>
				<p className="text-sm text-muted-foreground">Your plan tracks one platform for this brand.</p>

				{picker.upgradeOptions.length > 0 && <UpgradePanel options={picker.upgradeOptions} brandId={brandId} />}
			</CardContent>
		</Card>
	);
}

/**
 * The premium group in cloud: a grounded call is an allowance rather than a pick,
 * so this card reports the pool and points at the two places that change it —
 * billing for how many slots, the prompts editor for which prompts and models
 * spend them.
 */
function PremiumApiPool({ premium }: { premium: PremiumPool }) {
	const { brand: brandId } = Route.useParams();
	const copy = platformGroupCopy("premium");
	const remaining = Math.max(0, premium.total - premium.assigned);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center justify-between gap-3">
					<span>{copy.title}</span>
					<Badge variant={remaining === 0 ? "destructive" : "secondary"}>
						{premium.assigned} / {premium.total} pairings
					</Badge>
				</CardTitle>
				<CardDescription>{copy.description}</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="space-y-2">
					{PREMIUM_MODELS.map((model) => (
						<div key={model} className="flex items-center gap-3 rounded-md border p-3">
							<ModelIcon iconId={getModelMeta(model).iconId} className="size-5" />
							<span className="flex-1 text-sm font-medium">{premiumModelLabel(model)}</span>
							<span className="font-mono text-[10px] text-muted-foreground tabular-nums">
								{PREMIUM_RUNS_PER_DAY}×/day
							</span>
						</div>
					))}
				</div>

				<p className="text-sm text-muted-foreground">
					{remaining > 0
						? `${remaining} of ${premium.total} pairings still available, shared across every brand in this workspace. A prompt spends one for each model you track it on.`
						: `All ${premium.total} pairings are in use. Free one up or buy more to add another.`}
				</p>

				<div className="flex flex-wrap gap-2">
					<Link
						to="/app/$brand/settings/prompts"
						params={{ brand: brandId }}
						className={buttonVariants({ variant: "outline", size: "sm" })}
					>
						Choose prompts
					</Link>
					<Link
						to="/app/$brand/settings/billing"
						params={{ brand: brandId }}
						className={buttonVariants({ variant: "ghost", size: "sm" })}
					>
						Change how many
						<IconArrowUpRight className="h-4 w-4" />
					</Link>
				</div>
			</CardContent>
		</Card>
	);
}

/**
 * Self-hosted only: what else Elmo can track, and which provider account each
 * one needs. The provider status workflow exercises every suggested combination.
 *
 * Scrapers and direct APIs are separate columns because they are not
 * interchangeable — Perplexity through BrightData returns the surface a visitor
 * sees, while Perplexity through OpenRouter returns the model's own answer. A
 * single list of provider names hid that choice.
 */
const PROVIDER_COLUMNS = [
	{ access: "scraped", header: "Scrapers" },
	{ access: "api", header: "Direct APIs" },
] as const;

const PROVIDER_GRID = "grid grid-cols-[minmax(7rem,1fr)_1.5fr_1fr] gap-x-4";

function AddPlatformsCard({ platforms }: { platforms: ModelPickerState["unconfiguredPlatforms"] }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Track more platforms</CardTitle>
				<CardDescription>
					Add these to <code className="font-mono text-xs">SCRAPE_TARGETS</code> to start tracking them. One account is
					enough, but which kind you pick changes the data: a scraper reads the product a visitor uses, an API asks the
					model directly.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				<div className={`${PROVIDER_GRID} gap-y-2 border-b pb-2 text-xs font-medium text-muted-foreground`}>
					<span>Platform</span>
					{PROVIDER_COLUMNS.map((column) => (
						<span key={column.access}>{column.header}</span>
					))}
				</div>
				<div className="divide-y">
					{platforms.map((platform) => (
						<div key={platform.model} className={`${PROVIDER_GRID} items-start gap-y-1 py-2`}>
							<span className="flex items-center gap-2 text-sm font-medium">
								<ModelIcon iconId={getModelMeta(platform.model).iconId} className="size-4 shrink-0" />
								<span className="truncate">{getModelMeta(platform.model).label}</span>
							</span>
							{PROVIDER_COLUMNS.map((column) => (
								<ProviderLinks
									key={column.access}
									providers={platform.providers.filter((provider) => provider.access === column.access)}
								/>
							))}
						</div>
					))}
				</div>
				<a
					href={PROVIDERS_DOCS_URL}
					target="_blank"
					rel="noopener noreferrer"
					className={buttonVariants({ variant: "outline", size: "sm" })}
				>
					Provider setup guide
					<IconExternalLink className="h-4 w-4" />
				</a>
			</CardContent>
		</Card>
	);
}

/** A cell's providers, or a dash when a platform can't be reached that way. */
function ProviderLinks({ providers }: { providers: ModelPickerState["unconfiguredPlatforms"][number]["providers"] }) {
	if (providers.length === 0) return <span className="text-sm text-muted-foreground">—</span>;

	return (
		<span className="flex flex-wrap gap-x-2 gap-y-1">
			{providers.map((provider) => (
				<a
					key={provider.id}
					href={provider.docsUrl}
					target="_blank"
					rel="noopener noreferrer"
					className="text-sm text-muted-foreground underline decoration-dotted hover:text-foreground"
				>
					{provider.name}
				</a>
			))}
		</span>
	);
}
