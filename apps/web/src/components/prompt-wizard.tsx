/**
 * Single-step onboarding wizard.
 *
 * One LLM call returns brand info + competitors + prompts; the user reviews
 * and edits before saving. Replaces the prior 4-step wizard that required
 * DataForSEO + Anthropic in tandem.
 */
import { useState, useCallback, memo, useMemo } from "react";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import { Badge } from "@workspace/ui/components/badge";
import { Input } from "@workspace/ui/components/input";
import { Loader2, AlertCircle, Play, Rocket, ChevronDown, ChevronRight } from "lucide-react";
import { TagsInput } from "@workspace/ui/components/tags-input";
import { Separator } from "@workspace/ui/components/separator";
import { useBrand } from "@/hooks/use-brands";
import { analyzeBrandFn, createOnboardedBrandFn } from "@/server/onboarding";
import { trackEvent } from "@/lib/posthog";
import { CompetitorsEditor, newCompetitorEntry, type CompetitorEntry } from "@/components/competitors-editor";

interface PromptWizardProps {
	onComplete: () => void;
}

interface PromptDraft {
	id: string;
	value: string;
	tags: string[];
	selected: boolean;
}

interface WizardData {
	brandName: string;
	website: string;
	additionalDomains: string[];
	aliases: string[];
	competitors: CompetitorEntry[];
	prompts: PromptDraft[];
	customPrompts: string[];
}

const generateId = () => {
	if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
	return `id-${Math.random().toString(36).slice(2, 11)}-${Date.now().toString(36)}`;
};

const EditableTagsInput = memo(
	({
		items,
		onValueChange,
		placeholder = "Add item...",
		maxItems = 10,
	}: {
		items: string[];
		onValueChange: (value: string[]) => void;
		placeholder?: string;
		maxItems?: number;
	}) => (
		<div className="space-y-2">
			<TagsInput
				value={items}
				onValueChange={onValueChange}
				placeholder={placeholder}
				searchPlaceholder={placeholder}
				maxItems={maxItems}
			/>
			<p className="text-xs text-muted-foreground">
				<strong>
					{items.length}/{maxItems}
				</strong>{" "}
				{items.length >= maxItems ? "items added. Remove an item to add a new one." : "items entered."}
			</p>
		</div>
	),
);
EditableTagsInput.displayName = "EditableTagsInput";

const CollapsibleSection = memo(
	({
		title,
		count,
		badgeColor,
		subtitle,
		children,
		defaultOpen = false,
	}: {
		title: string;
		count: number;
		badgeColor: string;
		subtitle?: string;
		children: React.ReactNode;
		defaultOpen?: boolean;
	}) => {
		const [isOpen, setIsOpen] = useState(defaultOpen);
		return (
			<div className="border rounded-lg">
				<button
					type="button"
					onClick={() => setIsOpen(!isOpen)}
					className="flex w-full items-center justify-between p-3 text-sm font-medium hover:bg-accent/50 transition-colors"
				>
					<div className="flex items-center gap-2">
						<Badge variant="default" className={badgeColor}>
							{count}
						</Badge>
						<span>{title}</span>
						{subtitle && <span className="text-xs text-muted-foreground font-normal">({subtitle})</span>}
					</div>
					{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
				</button>
				{isOpen && <div className="border-t">{children}</div>}
			</div>
		);
	},
);
CollapsibleSection.displayName = "CollapsibleSection";

export default function PromptWizard({ onComplete }: PromptWizardProps) {
	const { brand, revalidate } = useBrand();
	const [phase, setPhase] = useState<"idle" | "analyzing" | "review">("idle");
	const [error, setError] = useState<string | null>(null);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const [data, setData] = useState<WizardData>({
		brandName: "",
		website: "",
		additionalDomains: [],
		aliases: [],
		competitors: [],
		prompts: [],
		customPrompts: [],
	});

	const handleAnalyze = useCallback(async () => {
		if (!brand?.website) return;
		setError(null);
		setPhase("analyzing");
		try {
			const suggestion = await analyzeBrandFn({
				data: {
					website: brand.website,
					brandName: brand.name,
					includeCompetitors: true,
					includePrompts: true,
				},
			});
			setData({
				brandName: suggestion.brandName || brand?.name || "",
				website: brand?.website || suggestion.website || "",
				additionalDomains: suggestion.additionalDomains,
				aliases: suggestion.aliases,
				competitors: suggestion.competitors.map((c) =>
					newCompetitorEntry({
						name: c.name,
						domains: c.domains,
						aliases: c.aliases,
						expanded: false,
					}),
				),
				prompts: suggestion.suggestedPrompts.map((p) => ({
					id: generateId(),
					value: p.prompt,
					tags: p.tags,
					selected: true,
				})),
				customPrompts: [],
			});
			setPhase("review");
			trackEvent("onboarding_analyzed", {
				competitor_count: suggestion.competitors.length,
				prompt_count: suggestion.suggestedPrompts.length,
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : "Analysis failed";
			setError(message);
			setPhase("idle");
		}
	}, [brand?.website, brand?.name]);

	const updateBrandName = useCallback((brandName: string) => setData((p) => ({ ...p, brandName })), []);
	const updateWebsite = useCallback((website: string) => setData((p) => ({ ...p, website })), []);
	const updateAliases = useCallback((aliases: string[]) => setData((p) => ({ ...p, aliases })), []);
	const updateAdditionalDomains = useCallback(
		(additionalDomains: string[]) => setData((p) => ({ ...p, additionalDomains })),
		[],
	);
	const updateCustomPrompts = useCallback(
		(customPrompts: string[]) => setData((p) => ({ ...p, customPrompts })),
		[],
	);

	const updateCompetitors = useCallback(
		(competitors: CompetitorEntry[]) => setData((p) => ({ ...p, competitors })),
		[],
	);

	const togglePrompt = useCallback(
		(id: string, selected: boolean) =>
			setData((p) => ({ ...p, prompts: p.prompts.map((pr) => (pr.id === id ? { ...pr, selected } : pr)) })),
		[],
	);
	const setAllPrompts = useCallback(
		(selected: boolean) =>
			setData((p) => ({ ...p, prompts: p.prompts.map((pr) => ({ ...pr, selected })) })),
		[],
	);

	const previewCounts = useMemo(() => {
		const selectedPrompts = data.prompts.filter((p) => p.selected).length;
		const customPrompts = data.customPrompts.filter((p) => p.trim().length > 0).length;
		const totalNew = selectedPrompts + customPrompts;
		return { selectedPrompts, customPrompts, totalNew };
	}, [data.prompts, data.customPrompts]);

	const handleSubmit = useCallback(async () => {
		if (!brand?.id) return;
		setSubmitError(null);
		setIsSaving(true);
		try {
			const competitorsPayload = data.competitors
				.filter((c) => c.name.trim() && c.domains.some((d) => d.trim()))
				.map((c) => ({
					name: c.name.trim(),
					domains: c.domains.filter((d) => d.trim()),
					aliases: c.aliases,
				}));

			const promptsPayload = [
				...data.prompts
					.filter((p) => p.selected && p.value.trim())
					.map((p) => ({ value: p.value, tags: p.tags, enabled: true })),
				...data.customPrompts
					.map((value) => value.trim())
					.filter(Boolean)
					.map((value) => ({ value, tags: [], enabled: true })),
			];

			await createOnboardedBrandFn({
				data: {
					brandId: brand.id,
					brandName: data.brandName.trim() || brand.name,
					website: data.website.trim() || brand.website,
					additionalDomains: data.additionalDomains,
					aliases: data.aliases,
					competitors: competitorsPayload,
					prompts: promptsPayload,
					generateCompetitors: false,
					generatePrompts: false,
					autoCreateBrand: false,
				},
			});

			trackEvent("wizard_completed", {
				prompts_created: promptsPayload.length,
				competitors_created: competitorsPayload.length,
				skipped: false,
			});

			await revalidate();
			onComplete();
		} catch (err) {
			setSubmitError(err instanceof Error ? err.message : "Failed to save");
		} finally {
			setIsSaving(false);
		}
	}, [brand, data, revalidate, onComplete]);

	if (phase === "idle" || phase === "analyzing") {
		return (
			<div className="max-w-2xl mx-auto space-y-6">
				<Card>
					<CardContent className="space-y-3 py-6">
						<p className="text-sm text-muted-foreground">
							We'll analyze <strong>{brand?.website}</strong> using web search to suggest competitors,
							additional domains/aliases, and a starter set of AI prompts to track.
						</p>
						{error && (
							<div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
								<AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
								<span>{error}</span>
							</div>
						)}
					</CardContent>
				</Card>
				<Button
					onClick={handleAnalyze}
					disabled={phase === "analyzing"}
					className="flex items-center gap-2 cursor-pointer"
				>
					{phase === "analyzing" ? (
						<>
							<Loader2 className="h-4 w-4 animate-spin" /> Analyzing brand…
						</>
					) : (
						<>
							<Play className="h-4 w-4" /> Analyze brand
						</>
					)}
				</Button>
			</div>
		);
	}

	return (
		<div className="max-w-2xl mx-auto space-y-6">
			<div className="space-y-2">
				<h2 className="text-2xl font-bold">Brand details</h2>
				<p className="text-muted-foreground">
					Confirm the brand identity, additional domains, and aliases used for tracking.
				</p>
				<div className="space-y-3">
					<div>
						<p className="text-xs text-muted-foreground">Brand name</p>
						<Input
							value={data.brandName}
							onChange={(e) => updateBrandName(e.target.value)}
							placeholder="Brand name"
						/>
					</div>
					<div>
						<p className="text-xs text-muted-foreground">Website URL</p>
						<Input
							type="url"
							value={data.website}
							onChange={(e) => updateWebsite(e.target.value)}
							placeholder="https://example.com"
						/>
					</div>
					<div>
						<p className="text-xs text-muted-foreground">Additional domains</p>
						<EditableTagsInput
							items={data.additionalDomains}
							onValueChange={updateAdditionalDomains}
							placeholder="Add domain..."
							maxItems={10}
						/>
					</div>
					<div>
						<p className="text-xs text-muted-foreground">Aliases</p>
						<EditableTagsInput
							items={data.aliases}
							onValueChange={updateAliases}
							placeholder="Add alias..."
							maxItems={10}
						/>
					</div>
				</div>
			</div>

			<Separator />

			<div className="space-y-3">
				<div>
					<h2 className="text-2xl font-bold">Competitors</h2>
					<p className="text-muted-foreground">Companies you want tracked alongside your brand.</p>
				</div>
				<CompetitorsEditor competitors={data.competitors} onChange={updateCompetitors} disabled={isSaving} />
			</div>

			<Separator />

			<div className="space-y-3">
				<div>
					<h2 className="text-2xl font-bold">Suggested prompts</h2>
					<p className="text-muted-foreground">Pick the prompts to start tracking. Each prompt gets default tags.</p>
				</div>
				<div className="flex gap-2">
					<Button variant="outline" size="sm" onClick={() => setAllPrompts(true)} className="cursor-pointer">
						Select all
					</Button>
					<Button variant="outline" size="sm" onClick={() => setAllPrompts(false)} className="cursor-pointer">
						Clear all
					</Button>
				</div>
				<div className="space-y-1">
					{data.prompts.map((p) => (
						<label
							key={p.id}
							className="hover:bg-accent/50 flex items-center gap-3 rounded-lg border p-2.5 has-[:checked]:border-blue-600 has-[:checked]:bg-blue-50 dark:has-[:checked]:border-blue-900 dark:has-[:checked]:bg-blue-950/40 cursor-pointer"
						>
							<input
								type="checkbox"
								checked={p.selected}
								onChange={(e) => togglePrompt(p.id, e.target.checked)}
								className="h-4 w-4"
							/>
							<span className="flex-1 text-sm">{p.value}</span>
							{p.tags.length > 0 && (
								<div className="flex gap-1 flex-shrink-0">
									{p.tags.map((tag) => (
										<Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">
											{tag}
										</Badge>
									))}
								</div>
							)}
						</label>
					))}
					{data.prompts.length === 0 && (
						<p className="text-sm text-muted-foreground italic px-2">
							No prompt suggestions returned. Add custom prompts below.
						</p>
					)}
				</div>
			</div>

			<Separator />

			<div className="space-y-2">
				<h2 className="text-2xl font-bold">Custom prompts</h2>
				<p className="text-muted-foreground">Add anything you want tracked that the suggestions missed.</p>
				<EditableTagsInput
					items={data.customPrompts}
					onValueChange={updateCustomPrompts}
					placeholder="Add custom prompt..."
					maxItems={20}
				/>
			</div>

			<Separator />

			<CollapsibleSection
				title="Summary"
				count={previewCounts.totalNew}
				badgeColor="bg-blue-500"
				subtitle="prompts to create"
				defaultOpen
			>
				<div className="bg-muted/30 p-3 text-sm space-y-1">
					<div>
						<strong>{previewCounts.selectedPrompts}</strong> selected suggestions
					</div>
					<div>
						<strong>{previewCounts.customPrompts}</strong> custom prompts
					</div>
					<div>
						<strong>{data.competitors.length}</strong> competitors
					</div>
				</div>
			</CollapsibleSection>

			{submitError && (
				<div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
					<AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
					<div className="text-sm">{submitError}</div>
				</div>
			)}

			<Button
				onClick={handleSubmit}
				disabled={isSaving || previewCounts.totalNew === 0}
				className="flex items-center gap-2 cursor-pointer"
			>
				{isSaving ? (
					<>
						<Loader2 className="h-4 w-4 animate-spin" /> Saving…
					</>
				) : (
					<>
						<Rocket className="h-4 w-4" /> Start tracking ({previewCounts.totalNew} new prompts)
					</>
				)}
			</Button>
		</div>
	);
}
