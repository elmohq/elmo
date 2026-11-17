import { IconInfoCircle } from "@tabler/icons-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type Market, sameMarket } from "@workspace/config/markets";
import { brandSegment, brandSlugPrefix, normalizeSlug } from "@workspace/lib/app-urls";
import { cleanAndValidateDomain, validateAdditionalDomain } from "@workspace/lib/citations/domain-categories";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { TagsInput } from "@workspace/ui/components/tags-input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { useCallback, useState } from "react";
import { MarketPicker } from "@/components/market-picker";
import { SlugField } from "@/components/slug-field";
import { WriteErrorMessage } from "@/components/write-error-message";
import { useBrand } from "@/hooks/use-brands";
import { citationKeys } from "@/hooks/use-citations";
import { dashboardKeys } from "@/hooks/use-dashboard-summary";
import { useOrganization, useOrganizationsChanged } from "@/hooks/use-organizations";
import { useBrandParams } from "@/hooks/use-route-params";
import type { MarketSupport } from "@/lib/market-support";
import { pageHead } from "@/lib/route-head";
import { useWriteErrorMessage } from "@/lib/write-errors";
import { updateBrandFn } from "@/server/brands";
import { getMarketSupportFn } from "@/server/market-support";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/settings/brand")({
	staticData: { crumb: "Brand" },
	head: pageHead({ title: "Brand Settings", description: "Manage your brand name and website." }),
	component: BrandSettingsPage,
});

function DefaultMarketField({
	market,
	onChange,
	support,
	saved,
	following,
	disabled,
}: {
	market: Market;
	onChange: (market: Market) => void;
	support: MarketSupport;
	saved: Market;
	/** Enabled prompts that follow the default, and so move with it. */
	following: number;
	disabled: boolean;
}) {
	return (
		<div className="space-y-2">
			<Label>Default Market</Label>
			<MarketPicker
				value={market}
				onChange={(next) => next && onChange(next)}
				support={support}
				disabled={disabled}
				className="max-w-sm"
			/>
			<p className="text-xs text-muted-foreground">
				The country prompts are asked from and the language they are written in, unless a prompt sets its own.
			</p>
			{!sameMarket(market, saved) && (
				<p className="text-xs text-amber-700">
					Saving moves {following === 1 ? "the 1 prompt" : `all ${following} prompts`} that follow the default. Their
					text is not translated, their earlier answers stay in their history and count under the new market, and models
					that can&apos;t answer from the new country stop running them.
				</p>
			)}
		</div>
	);
}

function BrandSettingsPage() {
	const { data: brand, isLoading, refetch: refetchBrand } = useBrand();
	const queryClient = useQueryClient();
	const organization = useOrganization();
	const organizationsChanged = useOrganizationsChanged();
	const brandParams = useBrandParams();
	const navigate = useNavigate();
	const writeError = useWriteErrorMessage();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState("");
	const [success, setSuccess] = useState("");
	const [additionalDomains, setAdditionalDomains] = useState<string[]>([]);
	const [aliases, setAliases] = useState<string[]>([]);
	const [slug, setSlug] = useState("");
	const [market, setMarket] = useState<Market | null>(null);
	const { data: marketSupport } = useQuery({
		queryKey: ["market-support", brand?.id],
		queryFn: () => getMarketSupportFn({ data: { brandId: brand!.id } }),
		enabled: Boolean(brand?.id),
	});

	// Reseed the fields when the brand changes server-side, without discarding
	// whatever is being typed in between.
	const [seededFrom, setSeededFrom] = useState<Date | null>(null);
	if (brand && brand.updatedAt !== seededFrom) {
		setSeededFrom(brand.updatedAt);
		setAdditionalDomains(brand.additionalDomains || []);
		setAliases(brand.aliases || []);
		setSlug(brandSegment(brand));
		setMarket({ country: brand.country, language: brand.language });
	}

	const validateDomain = useCallback(
		(val: string, current: string[]) => validateAdditionalDomain(val, [brand?.website, ...current]),
		[brand?.website],
	);
	const handleAliasesChange = useCallback((values: string[]) => setAliases(values), []);

	if (isLoading) {
		return (
			<div className="space-y-6">
				<div>
					<h1 className="text-3xl font-bold">Brand</h1>
					<p className="text-muted-foreground">Loading...</p>
				</div>
			</div>
		);
	}

	if (!brand) {
		return (
			<div className="space-y-6">
				<div>
					<h1 className="text-3xl font-bold">Brand</h1>
					<p className="text-destructive">Brand not found</p>
				</div>
			</div>
		);
	}

	const currentSlug = brandSegment(brand);

	const handleSubmit = async (formData: FormData) => {
		setIsSubmitting(true);
		setError("");
		setSuccess("");

		try {
			const name = formData.get("name") as string;
			const website = formData.get("website") as string;

			const nextSlug = normalizeSlug(slug);
			const slugMoved = nextSlug !== currentSlug;
			await updateBrandFn({
				data: {
					brandId: brand.id,
					name,
					website,
					...(slugMoved && { slug: nextSlug }),
					additionalDomains,
					aliases,
					...(market && { country: market.country, language: market.language }),
				},
			});

			// Domain/alias changes affect citation categorization and mention detection
			queryClient.invalidateQueries({ queryKey: citationKeys.all });
			queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
			queryClient.invalidateQueries({ queryKey: ["market-support", brand.id] });

			setSuccess("Brand details updated successfully!");
			await refetchBrand();
			await organizationsChanged(
				slugMoved
					? () =>
							navigate({
								to: "/app/org/$org/brand/$brand/settings/brand",
								params: { ...brandParams, brand: nextSlug },
								replace: true,
							})
					: undefined,
			);
		} catch (err) {
			setError(writeError(err, "Failed to save the brand."));
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="space-y-6 max-w-2xl">
			<div>
				<h1 className="text-3xl font-bold">Brand</h1>
				<p className="text-muted-foreground">Manage your brand name and website</p>
			</div>

			<form action={handleSubmit} className="space-y-6">
				<div className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="name">Brand Name</Label>
						<Input
							id="name"
							name="name"
							type="text"
							placeholder="Brand Name"
							defaultValue={brand.name}
							required
							disabled={isSubmitting}
						/>
						<p className="text-xs text-muted-foreground">Enter your brand&apos;s name</p>
					</div>

					<SlugField
						id="brand-slug"
						label="Brand Slug"
						prefix={brandSlugPrefix(organization)}
						value={slug}
						onChange={setSlug}
						disabled={isSubmitting}
					/>

					<div className="space-y-2">
						<Label htmlFor="website">Website</Label>
						<Input
							id="website"
							name="website"
							type="text"
							placeholder="example.com"
							defaultValue={brand.website}
							required
							disabled={isSubmitting}
						/>
						<p className="text-xs text-muted-foreground">Your brand&apos;s primary website</p>
					</div>

					{market && marketSupport && (
						<DefaultMarketField
							market={market}
							onChange={setMarket}
							support={marketSupport}
							saved={{ country: brand.country, language: brand.language }}
							following={brand.prompts.filter((prompt) => prompt.enabled && !prompt.country && !prompt.language).length}
							disabled={isSubmitting}
						/>
					)}

					<div className="space-y-2">
						<Label className="flex items-center gap-1.5">
							Additional Domains
							<Tooltip>
								<TooltipTrigger render={<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />} />
								<TooltipContent className="max-w-xs text-xs font-normal">
									Other domains your brand owns, like example.co.uk. Subdomains are covered automatically. Changes apply
									to existing citations too.
								</TooltipContent>
							</Tooltip>
						</Label>
						<TagsInput
							value={additionalDomains}
							onValueChange={setAdditionalDomains}
							placeholder="Add domain..."
							pasteSplitter={/[\n,\t]+/}
							searchPlaceholder="Add domain..."
							maxItems={10}
							normalizeValue={(raw) => cleanAndValidateDomain(raw) ?? raw.trim()}
							onValidate={validateDomain}
						/>
					</div>

					<div className="space-y-2">
						<Label className="flex items-center gap-1.5">
							Brand Aliases
							<Tooltip>
								<TooltipTrigger render={<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />} />
								<TooltipContent className="max-w-xs text-xs font-normal">
									Alternative names for your brand (sub-brands, product lines, abbreviations). Used for mention
									detection in <strong>future</strong> prompt runs only &mdash; does not apply retroactively to past
									results.
								</TooltipContent>
							</Tooltip>
						</Label>
						<TagsInput
							value={aliases}
							onValueChange={handleAliasesChange}
							placeholder="Add alias..."
							searchPlaceholder="Add alias..."
							maxItems={10}
						/>
					</div>
				</div>

				{error && (
					<div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
						<WriteErrorMessage message={error} />
					</div>
				)}
				{success && <div className="text-sm text-green-600 bg-green-50 p-3 rounded-md">{success}</div>}

				<div className="flex gap-2">
					<Button type="submit" disabled={isSubmitting} className="cursor-pointer">
						{isSubmitting ? "Saving..." : "Save Changes"}
					</Button>
				</div>
			</form>
		</div>
	);
}
