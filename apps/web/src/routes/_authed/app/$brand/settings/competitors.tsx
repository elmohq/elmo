/**
 * /app/$brand/settings/competitors - Competitor management page
 *
 * Form to manage competitor list with multiple domains and aliases per competitor.
 */
import { useState, useEffect, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { getAppName, getBrandName, buildTitle } from "@/lib/route-head";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { useBrand, useCompetitors } from "@/hooks/use-brands";
import { updateCompetitors } from "@/server/brands";
import { citationKeys } from "@/hooks/use-citations";
import { dashboardKeys } from "@/hooks/use-dashboard-summary";
import { Plus, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert";
import { Tooltip, TooltipTrigger, TooltipContent } from "@workspace/ui/components/tooltip";
import { IconInfoCircle } from "@tabler/icons-react";
import { TagsInput } from "@workspace/ui/components/tags-input";
import { MAX_COMPETITORS } from "@workspace/lib/constants";
import { cleanAndValidateDomain } from "@/lib/domain-categories";

interface CompetitorEntry {
	_key: string;
	name: string;
	domains: string[];
	aliases: string[];
	expanded: boolean;
}

export const Route = createFileRoute("/_authed/app/$brand/settings/competitors")({
	head: ({ matches, match }) => {
		const appName = getAppName(match);
		const brandName = getBrandName(matches);
		return {
			meta: [
				{ title: buildTitle("Competitors", { appName, brandName }) },
				{ name: "description", content: "Manage your tracked competitors." },
			],
		};
	},
	component: CompetitorsSettingsPage,
});

function CompetitorsSettingsPage() {
	const { brand: brandId } = Route.useParams();
	const { brand, isLoading } = useBrand(brandId);
	const { competitors: existingCompetitors, isLoading: competitorsLoading } = useCompetitors(brandId);
	const queryClient = useQueryClient();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState("");
	const [success, setSuccess] = useState("");
	const [competitors, setCompetitors] = useState<CompetitorEntry[]>([]);
	const [domainErrors, setDomainErrors] = useState<Record<string, string>>({});

	useEffect(() => {
		if (existingCompetitors.length > 0) {
			setCompetitors(
				existingCompetitors.map((c) => ({
					_key: crypto.randomUUID(),
					name: c.name,
					domains: c.domains?.length ? [...c.domains] : [""],
					aliases: c.aliases || [],
					expanded: false,
				})),
			);
		}
	}, [existingCompetitors]);

	const addCompetitor = () => {
		if (competitors.length < MAX_COMPETITORS) {
			setCompetitors([...competitors, { _key: crypto.randomUUID(), name: "", domains: [""], aliases: [], expanded: true }]);
		}
	};

	const removeCompetitor = (index: number) => {
		setCompetitors(competitors.filter((_, i) => i !== index));
	};

	const updateName = useCallback((key: string, name: string) => {
		setCompetitors((prev) => prev.map((c) => (c._key === key ? { ...c, name } : c)));
	}, []);

	const updateDomains = useCallback((key: string, domains: string[]) => {
		setCompetitors((prev) => {
			const existing = prev.find((c) => c._key === key);
			if (!existing) return prev;

			const last = domains[domains.length - 1];
			const isAdding = domains.length > existing.domains.filter(Boolean).length;
			if (isAdding && last) {
				const cleaned = cleanAndValidateDomain(last);
				if (!cleaned) {
					setDomainErrors((e) => ({ ...e, [key]: `"${last}" is not a valid domain` }));
					return prev;
				}
				setDomainErrors((e) => { const next = { ...e }; delete next[key]; return next; });
				const newDomains = [...domains.slice(0, -1), cleaned];
				return prev.map((c) => (c._key === key ? { ...c, domains: newDomains } : c));
			}

			setDomainErrors((e) => { const next = { ...e }; delete next[key]; return next; });
			return prev.map((c) => (c._key === key ? { ...c, domains } : c));
		});
	}, []);

	const updateAliases = useCallback((key: string, aliases: string[]) => {
		setCompetitors((prev) => prev.map((c) => (c._key === key ? { ...c, aliases } : c)));
	}, []);

	const toggleExpanded = useCallback((key: string) => {
		setCompetitors((prev) => prev.map((c) => (c._key === key ? { ...c, expanded: !c.expanded } : c)));
	}, []);

	if (isLoading || competitorsLoading) {
		return (
			<div className="space-y-6">
				<div>
					<h1 className="text-3xl font-bold">Competitors</h1>
					<p className="text-muted-foreground">Loading...</p>
				</div>
			</div>
		);
	}

	if (!brand) {
		return (
			<div className="space-y-6">
				<div>
					<h1 className="text-3xl font-bold">Competitors</h1>
					<p className="text-destructive">Brand not found</p>
				</div>
			</div>
		);
	}

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsSubmitting(true);
		setError("");
		setSuccess("");

		try {
			const validCompetitors = competitors
				.filter((c) => c.name.trim() && c.domains.some((d) => d.trim()))
				.map((c) => ({
					name: c.name.trim(),
					domains: c.domains.map((d) => d.trim()).filter(Boolean),
					aliases: c.aliases.map((a) => a.trim()).filter(Boolean),
				}));

			await updateCompetitors({
				data: { brandId: brand.id, competitors: validCompetitors },
			});

			// Domain changes affect citation categorization retroactively
			queryClient.invalidateQueries({ queryKey: citationKeys.all });
			queryClient.invalidateQueries({ queryKey: dashboardKeys.all });

			setSuccess("Competitors updated successfully!");
		} catch (err) {
			setError(err instanceof Error ? err.message : "An error occurred");
		} finally {
			setIsSubmitting(false);
		}
	};

	const validCount = competitors.filter((c) => c.name.trim() && c.domains.some((d) => d.trim())).length;

	return (
		<div className="space-y-6 max-w-2xl">
			<div>
				<h1 className="text-3xl font-bold">Competitors</h1>
				<p className="text-muted-foreground">Manage your competitive landscape for reputation tracking.</p>
			</div>

			<Alert variant="default" className="border-yellow-200 bg-yellow-50 text-yellow-800">
				<AlertTriangle className="h-4 w-4 text-yellow-600" />
				<AlertTitle>Warning</AlertTitle>
				<AlertDescription className="text-yellow-700">
					Updating competitors will only apply to future prompt evaluations. Citation categorization updates retroactively.
				</AlertDescription>
			</Alert>

			<form onSubmit={handleSubmit} className="space-y-6">
				<div className="space-y-4">
					{competitors.map((competitor, index) => (
						<div key={competitor._key} className="border rounded-lg overflow-hidden">
							<div className="flex items-center gap-3 p-3">
								<div className="flex-1 min-w-0">
									{competitor.name ? (
										<span className="text-sm font-medium">{competitor.name}</span>
									) : (
										<span className="text-sm text-muted-foreground italic">Unnamed competitor</span>
									)}
									{competitor.domains.some(Boolean) && (
										<span className="text-xs text-muted-foreground ml-2">{competitor.domains.filter(Boolean)[0]}</span>
									)}
								</div>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={() => toggleExpanded(competitor._key)}
									className="p-1.5 h-auto cursor-pointer shrink-0"
									disabled={isSubmitting}
								>
									<Pencil className="h-3.5 w-3.5 text-muted-foreground" />
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={() => removeCompetitor(index)}
									className="p-1.5 h-auto cursor-pointer shrink-0 text-muted-foreground hover:text-destructive"
									disabled={isSubmitting}
								>
									<Trash2 className="h-3.5 w-3.5" />
								</Button>
							</div>

							{competitor.expanded && (
								<div className="px-3 pb-3 pt-0 space-y-3 border-t bg-muted/30">
									<div className="space-y-1.5 pt-3">
										<Label className="text-xs font-medium flex items-center gap-1.5">
											Name
											<Tooltip>
												<TooltipTrigger asChild>
													<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
												</TooltipTrigger>
												<TooltipContent className="max-w-xs text-xs font-normal">
													The primary name used to detect this competitor in AI responses. Mention detection applies to <strong>future</strong> prompt runs only.
												</TooltipContent>
											</Tooltip>
										</Label>
										<Input
											type="text"
											value={competitor.name}
											onChange={(e) => updateName(competitor._key, e.target.value)}
											placeholder="Competitor name"
											className="bg-background"
											disabled={isSubmitting}
										/>
									</div>

									<div className="space-y-1.5">
										<Label className="text-xs font-medium flex items-center gap-1.5">
											Domains
											<Tooltip>
												<TooltipTrigger asChild>
													<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
												</TooltipTrigger>
												<TooltipContent className="max-w-xs text-xs font-normal">
													All domains owned by this competitor. Citation categorization updates retroactively &mdash; existing citations from these domains will immediately be classified as &quot;competitor&quot;.
												</TooltipContent>
											</Tooltip>
										</Label>
										<TagsInput
											value={competitor.domains.filter(Boolean)}
											onValueChange={(values) => updateDomains(competitor._key, values.length > 0 ? values : [""])}
											placeholder="Add domain..."
											maxItems={10}
											normalizeValue={(raw) => cleanAndValidateDomain(raw) ?? raw.trim()}
										/>
										{domainErrors[competitor._key] && <p className="text-xs text-destructive">{domainErrors[competitor._key]}</p>}
									</div>

									<div className="space-y-1.5">
										<Label className="text-xs font-medium flex items-center gap-1.5">
											Aliases
											<Tooltip>
												<TooltipTrigger asChild>
													<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
												</TooltipTrigger>
												<TooltipContent className="max-w-xs text-xs font-normal">
													Alternative names for this competitor (sub-brands, product names, abbreviations). Used for mention detection in <strong>future</strong> prompt runs only &mdash; does not apply retroactively.
												</TooltipContent>
											</Tooltip>
										</Label>
										<TagsInput
											value={competitor.aliases}
											onValueChange={(values) => updateAliases(competitor._key, values)}
											placeholder="Add alias..."
											maxItems={10}
										/>
									</div>
								</div>
							)}
						</div>
					))}

					{competitors.length < MAX_COMPETITORS && (
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={addCompetitor}
							className="flex items-center gap-2 cursor-pointer"
							disabled={isSubmitting}
						>
							<Plus className="h-4 w-4" /> Add Competitor
						</Button>
					)}

					{competitors.length >= MAX_COMPETITORS && (
						<p className="text-xs text-muted-foreground">
							Maximum of {MAX_COMPETITORS} competitors allowed. Remove a competitor to add a new one.
						</p>
					)}

					<p className="text-xs text-muted-foreground">
						<strong>{validCount}/{MAX_COMPETITORS}</strong> competitors configured
					</p>
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
