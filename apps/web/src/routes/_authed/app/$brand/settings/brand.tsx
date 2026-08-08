/**
 * /app/$brand/settings/brand - Brand settings page
 *
 * Form to edit brand name, website, additional domains, and aliases.
 */
import { useState, useCallback, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { getAppName, getBrandName, buildTitle } from "@/lib/route-head";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { useBrand } from "@/hooks/use-brands";
import { updateBrandFn } from "@/server/brands";
import { citationKeys } from "@/hooks/use-citations";
import { dashboardKeys } from "@/hooks/use-dashboard-summary";
import { Tooltip, TooltipTrigger, TooltipContent } from "@workspace/ui/components/tooltip";
import { IconInfoCircle } from "@tabler/icons-react";
import { TagsInput } from "@workspace/ui/components/tags-input";
import { cleanAndValidateDomain } from "@/lib/domain-categories";
import { getTagsInputLabels } from "@/i18n/ui-labels";
import * as m from "@/paraglide/messages.js";

export const Route = createFileRoute("/_authed/app/$brand/settings/brand")({
	head: ({ matches, match }) => {
		const appName = getAppName(match);
		const brandName = getBrandName(matches);
		return {
			meta: [
				{ title: buildTitle(m.settings_brand_meta_title(), { appName, brandName }) },
				{ name: "description", content: m.settings_brand_description() },
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
		if (!cleaned) return m.settings_invalid_domain({ domain: val });
		return true;
	}, []);
	const handleAliasesChange = useCallback((values: string[]) => setAliases(values), []);

	if (isLoading) {
		return (
			<div className="space-y-6">
				<div>
					<h1 className="text-3xl font-bold">{m.settings_brand_title()}</h1>
					<p className="text-muted-foreground">{m.common_loading()}</p>
				</div>
			</div>
		);
	}

	if (!brand) {
		return (
			<div className="space-y-6">
				<div>
					<h1 className="text-3xl font-bold">{m.settings_brand_title()}</h1>
					<p className="text-destructive">{m.common_brand_not_found()}</p>
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

			setSuccess(m.settings_brand_updated());
			await revalidate();
		} catch (err) {
			setError(err instanceof Error ? err.message : m.common_error());
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="space-y-6 max-w-2xl">
			<div>
				<h1 className="text-3xl font-bold">{m.settings_brand_title()}</h1>
				<p className="text-muted-foreground">{m.settings_brand_description()}</p>
			</div>

			<form action={handleSubmit} className="space-y-6">
				<div className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="name">{m.settings_brand_name()}</Label>
						<Input
							id="name"
							name="name"
							type="text"
							placeholder={m.settings_brand_name()}
							defaultValue={brand.name}
							required
							disabled={isSubmitting}
						/>
						<p className="text-xs text-muted-foreground">{m.settings_brand_name_hint()}</p>
					</div>

					<div className="space-y-2">
						<Label htmlFor="website">{m.settings_website()}</Label>
						<Input
							id="website"
							name="website"
							type="text"
							placeholder="example.com"
							defaultValue={brand.website}
							required
							disabled={isSubmitting}
						/>
						<p className="text-xs text-muted-foreground">{m.settings_website_hint()}</p>
					</div>

					<div className="space-y-2">
						<Label className="flex items-center gap-1.5">
							{m.settings_additional_domains()}
							<Tooltip>
								<TooltipTrigger asChild>
									<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
								</TooltipTrigger>
								<TooltipContent className="max-w-xs text-xs font-normal">
									{m.settings_additional_domains_tip()}
								</TooltipContent>
							</Tooltip>
						</Label>
						<TagsInput
							value={additionalDomains}
							onValueChange={setAdditionalDomains}
							placeholder={m.settings_add_domain()}
							searchPlaceholder={m.settings_add_domain()}
							emptyText={m.tags_no_results()}
							labels={getTagsInputLabels()}
							maxItems={10}
							normalizeValue={(raw) => cleanAndValidateDomain(raw) ?? raw.trim()}
							onValidate={validateDomain}
						/>
					</div>

					<div className="space-y-2">
						<Label className="flex items-center gap-1.5">
							{m.settings_brand_aliases()}
							<Tooltip>
								<TooltipTrigger asChild>
									<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
								</TooltipTrigger>
								<TooltipContent className="max-w-xs text-xs font-normal">
									{m.settings_brand_aliases_tip()}
								</TooltipContent>
							</Tooltip>
						</Label>
						<TagsInput
							value={aliases}
							onValueChange={handleAliasesChange}
							placeholder={m.settings_add_alias()}
							searchPlaceholder={m.settings_add_alias()}
							emptyText={m.tags_no_results()}
							labels={getTagsInputLabels()}
							maxItems={10}
						/>
					</div>
				</div>

				{error && <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">{error}</div>}
				{success && <div className="text-sm text-green-600 bg-green-50 p-3 rounded-md">{success}</div>}

				<div className="flex gap-2">
					<Button type="submit" disabled={isSubmitting} className="cursor-pointer">
						{isSubmitting ? m.common_saving() : m.common_save_changes()}
					</Button>
				</div>
			</form>
		</div>
	);
}
