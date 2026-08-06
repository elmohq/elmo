/**
 * Single-step onboarding wizard.
 *
 * One LLM call returns brand info + competitors + prompts; the user reviews
 * and edits before saving. Replaces the prior 4-step wizard that required
 * DataForSEO + Anthropic in tandem.
 */
import { useState, useCallback, useEffect, memo, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Loader2, AlertCircle, Play, Rocket } from "lucide-react";
import { TagsInput } from "@workspace/ui/components/tags-input";
import { Separator } from "@workspace/ui/components/separator";
import { useBrand, brandKeys } from "@/hooks/use-brands";
import { citationKeys } from "@/hooks/use-citations";
import { dashboardKeys } from "@/hooks/use-dashboard-summary";
import { promptsSummaryKeys } from "@/hooks/use-prompts-summary";
import {
	startAnalyzeBrandFn,
	getAnalyzeBrandStatusFn,
	cancelAnalyzeBrandFn,
	updateOnboardedBrandFn,
} from "@/server/onboarding";
import { trackEvent } from "@/lib/posthog";
import { CompetitorsEditor, newCompetitorEntry, type CompetitorEntry } from "@/components/competitors-editor";
import { PromptsListEditor, newPromptEntry, type EditablePrompt } from "@/components/prompts-list-editor";

interface PromptWizardProps {
	onComplete: () => void;
}

/** Brand analysis runs in the worker (LLM + web search, ~1 min); the client polls for the result. */
const POLL_INTERVAL_MS = 2000;
const ANALYZE_TIMEOUT_MS = 6 * 60 * 1000; // give up after ~6 minutes

const analyzeStatusKey = (brandId: string) => ["analyze-brand", "status", brandId] as const;

interface WizardData {
	brandName: string;
	website: string;
	additionalDomains: string[];
	aliases: string[];
	competitors: CompetitorEntry[];
	prompts: EditablePrompt[];
}

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

export default function PromptWizard({ onComplete }: PromptWizardProps) {
	const { brand } = useBrand();
	const queryClient = useQueryClient();
	const router = useRouter();
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
	});

	const brandId = brand?.id;

	// Stop polling, drop the cached status so the next run starts clean, and
	// (best-effort) cancel the worker job. `errorMessage` surfaces a reason
	// (timeout); a bare cancel passes null.
	const stopAnalyzing = useCallback(
		(errorMessage: string | null) => {
			setPhase("idle");
			setError(errorMessage);
			if (brandId) {
				queryClient.removeQueries({ queryKey: analyzeStatusKey(brandId) });
				cancelAnalyzeBrandFn({ data: { brandId } }).catch(() => {});
			}
		},
		[brandId, queryClient],
	);

	const { mutate: enqueueAnalysis, isSuccess: analysisEnqueued } = useMutation({
		mutationFn: (vars: { brandId: string; website: string; brandName?: string }) => startAnalyzeBrandFn({ data: vars }),
		onError: (err) => {
			setError(err instanceof Error ? err.message : "Analysis failed");
			setPhase("idle");
		},
	});

	// Poll the job status while analyzing. The query stops itself once the job
	// reaches a terminal state (refetchInterval returns false), and is disabled
	// the moment we leave the analyzing phase.
	const statusQuery = useQuery({
		queryKey: analyzeStatusKey(brandId ?? "none"),
		queryFn: () => getAnalyzeBrandStatusFn({ data: { brandId: brandId! } }),
		// Only poll once the job is actually enqueued.
		enabled: phase === "analyzing" && analysisEnqueued && !!brandId,
		staleTime: 0,
		gcTime: 0,
		refetchInterval: (query) => (query.state.data?.status === "pending" ? POLL_INTERVAL_MS : false),
		refetchIntervalInBackground: true,
	});

	const handleAnalyze = useCallback(() => {
		if (!brand?.website || !brand?.id) return;
		setError(null);
		// Clear any stale status from a previous run before we start polling.
		queryClient.removeQueries({ queryKey: analyzeStatusKey(brand.id) });
		setPhase("analyzing");
		enqueueAnalysis({ brandId: brand.id, website: brand.website, brandName: brand.name });
	}, [brand?.website, brand?.id, brand?.name, queryClient, enqueueAnalysis]);

	// React to status transitions while analyzing.
	const statusData = statusQuery.data;
	useEffect(() => {
		if (phase !== "analyzing" || !statusData) return;
		if (statusData.status === "failed") {
			setError(statusData.error);
			setPhase("idle");
			if (brandId) queryClient.removeQueries({ queryKey: analyzeStatusKey(brandId) });
			return;
		}
		if (statusData.status === "done") {
			const suggestion = statusData.suggestion;
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
				prompts: suggestion.suggestedPrompts.map((p) =>
					newPromptEntry({ value: p.prompt, tags: p.tags, enabled: true }),
				),
			});
			setPhase("review");
			trackEvent("onboarding_analyzed", {
				competitor_count: suggestion.competitors.length,
				prompt_count: suggestion.suggestedPrompts.length,
			});
			if (brandId) queryClient.removeQueries({ queryKey: analyzeStatusKey(brandId) });
		}
	}, [phase, statusData, brandId, brand?.name, brand?.website, queryClient]);

	// Give up on a stuck analysis instead of polling forever.
	useEffect(() => {
		if (phase !== "analyzing") return;
		const timer = window.setTimeout(
			() => stopAnalyzing("Brand analysis timed out. Please try again."),
			ANALYZE_TIMEOUT_MS,
		);
		return () => window.clearTimeout(timer);
	}, [phase, stopAnalyzing]);

	const updateBrandName = useCallback((brandName: string) => setData((p) => ({ ...p, brandName })), []);
	const updateWebsite = useCallback((website: string) => setData((p) => ({ ...p, website })), []);
	const updateAliases = useCallback((aliases: string[]) => setData((p) => ({ ...p, aliases })), []);
	const updateAdditionalDomains = useCallback(
		(additionalDomains: string[]) => setData((p) => ({ ...p, additionalDomains })),
		[],
	);
	const updateCompetitors = useCallback(
		(competitors: CompetitorEntry[]) => setData((p) => ({ ...p, competitors })),
		[],
	);
	const updatePrompts = useCallback((prompts: EditablePrompt[]) => setData((p) => ({ ...p, prompts })), []);

	const previewCounts = useMemo(() => {
		const enabled = data.prompts.filter((p) => p.enabled && p.value.trim().length > 0).length;
		return { totalNew: enabled };
	}, [data.prompts]);

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

			const promptsPayload = data.prompts
				.filter((p) => p.enabled && p.value.trim())
				.map((p) => ({ value: p.value.trim(), tags: p.tags, enabled: true }));

			await updateOnboardedBrandFn({
				data: {
					brandId: brand.id,
					brandName: data.brandName.trim() || brand.name,
					website: data.website.trim() || brand.website,
					additionalDomains: data.additionalDomains,
					aliases: data.aliases,
					competitors: competitorsPayload,
					prompts: promptsPayload,
				},
			});

			trackEvent("wizard_completed", {
				prompts_created: promptsPayload.length,
				competitors_created: competitorsPayload.length,
				skipped: false,
			});

			// Deployments without an onboardingRedirectUrlTemplate (e.g. local mode) skip the full reload, so caches fetched while !onboarded must be busted explicitly.
			queryClient.invalidateQueries({ queryKey: brandKeys.all });
			queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
			queryClient.invalidateQueries({ queryKey: citationKeys.all });
			queryClient.invalidateQueries({ queryKey: promptsSummaryKeys.all });
			// The $brand route loader feeds `brand` into AppSidebar; invalidate it so the sidebar picks up onboarded=true.
			await router.invalidate();

			onComplete();
		} catch (err) {
			setSubmitError(err instanceof Error ? err.message : "Failed to save");
		} finally {
			setIsSaving(false);
		}
	}, [brand, data, queryClient, router, onComplete]);

	if (phase === "idle" || phase === "analyzing") {
		return (
			<div className="max-w-2xl mx-auto space-y-3">
				<p className="text-sm text-muted-foreground">
					We'll analyze <strong>{brand?.website}</strong> using web search to suggest competitors, additional
					domains/aliases, and a starter set of AI prompts to track.
				</p>
				{error && (
					<div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
						<AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
						<span>{error}</span>
					</div>
				)}
				<div className="flex items-center gap-2">
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
					{phase === "analyzing" && (
						<Button variant="outline" onClick={() => stopAnalyzing(null)} className="cursor-pointer">
							Cancel
						</Button>
					)}
				</div>
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
						<Input value={data.brandName} onChange={(e) => updateBrandName(e.target.value)} placeholder="Brand name" />
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
					<h2 className="text-2xl font-bold">Prompts</h2>
					<p className="text-muted-foreground">
						Pick which AI tracking prompts to start with. Untick any you don't want, edit tags, or add your own at the
						bottom.
					</p>
				</div>
				<PromptsListEditor prompts={data.prompts} onChange={updatePrompts} showSystemTags={false} />
			</div>

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
