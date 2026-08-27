/**
 * /app/org/$org/brand/$brand/settings/brand - Brand settings page
 *
 * Form to edit brand name, URL, website, additional domains, and aliases.
 */

import { IconInfoCircle } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { MAX_SLUG_LENGTH } from "@workspace/lib/db/provisioning";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { TagsInput } from "@workspace/ui/components/tags-input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { useCallback, useEffect, useState } from "react";
import { useBrand } from "@/hooks/use-brands";
import { citationKeys } from "@/hooks/use-citations";
import { dashboardKeys } from "@/hooks/use-dashboard-summary";
import { cleanAndValidateDomain } from "@/lib/domain-categories";
import { buildTitle, getAppName, getBrandName } from "@/lib/route-head";
import { setBrandSlugFn, updateBrandFn } from "@/server/brands";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/settings/brand")({
	head: ({ matches, match }) => {
		const appName = getAppName(match);
		const brandName = getBrandName(matches);
		return {
			meta: [
				{ title: buildTitle("Brand Settings", { appName, subject: brandName }) },
				{ name: "description", content: "Manage your brand name and website." },
			],
		};
	},
	component: BrandSettingsPage,
});

function BrandSettingsPage() {
	const { brand, isLoading, revalidate } = useBrand();
	const queryClient = useQueryClient();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState("");
	const [success, setSuccess] = useState("");
	const [additionalDomains, setAdditionalDomains] = useState<string[]>([]);
	const [aliases, setAliases] = useState<string[]>([]);

	useEffect(() => {
		if (brand) {
			setAdditionalDomains(brand.additionalDomains || []);
			setAliases(brand.aliases || []);
		}
	}, [brand?.updatedAt]);

	const validateDomain = useCallback((val: string): true | string => {
		const cleaned = cleanAndValidateDomain(val);
		if (!cleaned) return `"${val}" is not a valid domain`;
		return true;
	}, []);
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

	const handleSubmit = async (formData: FormData) => {
		setIsSubmitting(true);
		setError("");
		setSuccess("");

		try {
			const name = formData.get("name") as string;
			const website = formData.get("website") as string;

			await updateBrandFn({
				data: {
					brandId: brand.id,
					name,
					website,
					additionalDomains,
					aliases,
				},
			});

			// Domain/alias changes affect citation categorization and mention detection
			queryClient.invalidateQueries({ queryKey: citationKeys.all });
			queryClient.invalidateQueries({ queryKey: dashboardKeys.all });

			setSuccess("Brand details updated successfully!");
			await revalidate();
		} catch (err) {
			setError(err instanceof Error ? err.message : "An error occurred");
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

					<BrandUrlField brandId={brand.id} slug={brand.slug} />

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

					<div className="space-y-2">
						<Label className="flex items-center gap-1.5">
							Additional Domains
							<Tooltip>
								<TooltipTrigger asChild>
									<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
								</TooltipTrigger>
								<TooltipContent className="max-w-xs text-xs font-normal">
									Other domains your brand owns (e.g. blog.example.com, shop.example.com). Citations from these domains
									will be counted as your brand&apos;s citations. <strong>Updates retroactively</strong> &mdash;
									existing citations will be reclassified immediately.
								</TooltipContent>
							</Tooltip>
						</Label>
						<TagsInput
							value={additionalDomains}
							onValueChange={setAdditionalDomains}
							placeholder="Add domain..."
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
								<TooltipTrigger asChild>
									<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
								</TooltipTrigger>
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

				{error && <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">{error}</div>}
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

const SLUG_ERRORS: Record<string, string> = {
	invalid: "Use lowercase letters, numbers, and hyphens.",
	taken: "Another brand in this workspace already uses that URL.",
};

/**
 * The brand's URL segment, saved on its own rather than with the rest of the
 * form: changing it moves the page the form is sitting on, so it navigates to
 * the new address instead of leaving the browser on one that no longer resolves.
 *
 * A brand that predates slugs shows its id, which is what its URL already
 * carries — saving is what turns that into a real slug.
 */
function BrandUrlField({ brandId, slug }: { brandId: string; slug: string | null }) {
	const router = useRouter();
	const { org } = Route.useParams();
	const current = slug ?? brandId;
	const [value, setValue] = useState(current);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const next = value.trim().toLowerCase();
	const isDirty = next !== current;

	const handleSave = async () => {
		if (!isDirty || next.length === 0) return;
		setError(null);
		setSaving(true);
		try {
			const result = await setBrandSlugFn({ data: { brandId, slug: next } });
			if (!result.ok) {
				setError(SLUG_ERRORS[result.error ?? "invalid"] ?? "That URL can't be used.");
				return;
			}
			await router.navigate({
				to: "/app/org/$org/brand/$brand/settings/brand",
				params: { org, brand: result.slug ?? next },
				replace: true,
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to change the brand URL");
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="space-y-2">
			<Label htmlFor="brand-url">URL</Label>
			<div className="flex flex-wrap items-center gap-3">
				<div className="flex items-center rounded-md border font-mono text-sm">
					<span className="pl-3 text-muted-foreground">/brand/</span>
					<Input
						id="brand-url"
						value={value}
						onChange={(e) => setValue(e.target.value)}
						maxLength={MAX_SLUG_LENGTH}
						className="w-52 border-0 pl-0 font-mono text-sm shadow-none focus-visible:ring-0"
					/>
				</div>
				<Button type="button" variant="outline" onClick={handleSave} disabled={saving || !isDirty || !next}>
					{saving ? "Saving..." : "Change URL"}
				</Button>
			</div>
			{error ? (
				<p className="text-xs text-destructive">{error}</p>
			) : (
				<p className="text-xs text-muted-foreground">
					Changing this breaks existing links to this brand, including any bookmarks.
				</p>
			)}
		</div>
	);
}
