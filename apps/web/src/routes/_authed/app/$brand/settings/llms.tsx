/**
 * /app/$brand/settings/llms - LLM configuration page
 *
 * Choose which AI platforms this brand tracks, data-driven from the
 * deployment's `SCRAPE_TARGETS` + `brand.enabledModels`. In cloud mode the
 * choices are constrained by the plan (menu + pick count) and the page also
 * hosts the per-prompt Claude tracking assignment against the org's Claude
 * pool. The server functions hold the real limits; this page only renders
 * them.
 */
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { getAppName, getBrandName, buildTitle } from "@/lib/route-head";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { IconInfoCircle, IconLoader2, IconWorld, IconWorldOff } from "@tabler/icons-react";
import { getModelMeta } from "@workspace/lib/providers/models";
import { useState } from "react";
import { iconForModel } from "@/components/filter-bar";
import { getModelPickerStateFn, updateEnabledModelsFn, type ModelPickerState } from "@/server/brands";
import { getClaudeAssignmentsFn, setPromptClaudeModeFn, type ClaudeAssignmentsState } from "@/server/prompts";

export const Route = createFileRoute("/_authed/app/$brand/settings/llms")({
	loader: async ({ params }): Promise<{ picker: ModelPickerState; claude: ClaudeAssignmentsState }> => {
		const [picker, claude] = await Promise.all([
			getModelPickerStateFn({ data: { brandId: params.brand } }),
			getClaudeAssignmentsFn({ data: { brandId: params.brand } }),
		]);
		return { picker, claude };
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
	const { picker, claude } = Route.useLoaderData();

	return (
		<div className="space-y-8 max-w-6xl">
			<div>
				<h1 className="text-3xl font-bold">LLMs</h1>
				<p className="text-muted-foreground">
					Your prompts are evaluated against these AI models to track how your brand appears across different types of
					AI search.
				</p>
			</div>

			<ModelPicker picker={picker} />
			{claude.enabled && <ClaudeAssignments claude={claude} />}
		</div>
	);
}

function ModelPicker({ picker }: { picker: ModelPickerState }) {
	const { brand: brandId } = Route.useParams();
	const router = useRouter();
	// null stored picks = "everything the deployment configures" (non-cloud).
	const [selected, setSelected] = useState<Set<string>>(
		new Set(picker.enabledModels ?? picker.available.map((m) => m.model)),
	);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const stored = new Set(picker.enabledModels ?? picker.available.map((m) => m.model));
	const changed = selected.size !== stored.size || [...selected].some((m) => !stored.has(m));
	const limit = picker.planLimits?.platformPicks ?? null;
	const overLimit = limit !== null && selected.size > limit;

	const toggle = (model: string, checked: boolean) => {
		const next = new Set(selected);
		if (checked) next.add(model);
		else next.delete(model);
		setSelected(next);
	};

	const save = async () => {
		setSaving(true);
		setError(null);
		try {
			await updateEnabledModelsFn({ data: { brandId, models: [...selected] } });
			router.invalidate();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Could not save platform picks");
		} finally {
			setSaving(false);
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center justify-between">
					Tracked platforms
					{limit !== null && (
						<Badge variant={overLimit ? "destructive" : "secondary"}>
							{selected.size} / {limit} picks
						</Badge>
					)}
				</CardTitle>
				<CardDescription>
					{limit !== null
						? `Your plan tracks up to ${limit} platform${limit === 1 ? "" : "s"} for this brand. Changes apply from the next sampling cycle.`
						: "Which configured targets this brand runs. Changes apply from the next scheduled run."}
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{error && (
					<Alert variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}
				{picker.available.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No models are configured on this deployment. Set <code className="font-mono text-xs">SCRAPE_TARGETS</code>.
					</p>
				) : (
					<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
						{picker.available.map((target) => {
							const checked = selected.has(target.model);
							const disableCheck = !checked && limit !== null && selected.size >= limit;
							return (
								<label
									key={target.model}
									className={`flex items-center gap-3 rounded-md border p-3 ${
										disableCheck ? "opacity-50" : "cursor-pointer hover:bg-accent/50"
									}`}
								>
									<Checkbox
										checked={checked}
										disabled={disableCheck || saving}
										onCheckedChange={(value) => toggle(target.model, value === true)}
									/>
									{iconForModel(target.model, "h-5 w-5")}
									<span className="flex-1 text-sm font-medium">{getModelMeta(target.model).label}</span>
									<Tooltip>
										<TooltipTrigger asChild>
											{target.webSearch ? (
												<IconWorld className="h-4 w-4 text-muted-foreground" />
											) : (
												<IconWorldOff className="h-4 w-4 text-muted-foreground" />
											)}
										</TooltipTrigger>
										<TooltipContent className="max-w-xs text-xs">
											{target.provider}
											{target.version ? ` · ${target.version}` : ""} ·{" "}
											{target.webSearch ? "web search" : "no web search"}
										</TooltipContent>
									</Tooltip>
								</label>
							);
						})}
					</div>
				)}
				<div className="flex items-center gap-3">
					<Button onClick={save} disabled={!changed || overLimit || selected.size === 0 || saving}>
						{saving ? <IconLoader2 className="h-4 w-4 animate-spin" /> : "Save platforms"}
					</Button>
					{selected.size === 0 && <span className="text-sm text-muted-foreground">Pick at least one platform.</span>}
				</div>
			</CardContent>
		</Card>
	);
}

function ClaudeAssignments({ claude }: { claude: ClaudeAssignmentsState }) {
	const router = useRouter();
	const [busyPromptId, setBusyPromptId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const remaining = claude.pool.total - claude.pool.assigned;

	const setMode = async (promptId: string, mode: "base" | "web" | null) => {
		setBusyPromptId(promptId);
		setError(null);
		try {
			await setPromptClaudeModeFn({ data: { promptId, mode } });
			router.invalidate();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Could not update Claude tracking");
		} finally {
			setBusyPromptId(null);
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center justify-between">
					<span className="flex items-center gap-2">
						{iconForModel("claude", "h-5 w-5")}
						Claude tracking
						<Tooltip>
							<TooltipTrigger asChild>
								<IconInfoCircle className="h-4 w-4 cursor-help text-muted-foreground" />
							</TooltipTrigger>
							<TooltipContent className="max-w-xs text-xs">
								Assigned prompts run Claude once daily — web-grounded (Anthropic native web search) or base-model.
								The pool is shared across your whole workspace; buy extra prompts on the Billing page.
							</TooltipContent>
						</Tooltip>
					</span>
					<Badge variant={remaining <= 0 ? "destructive" : "secondary"}>
						{claude.pool.assigned} / {claude.pool.total} assigned
					</Badge>
				</CardTitle>
				<CardDescription>Choose which prompts get daily Claude tracking, and how Claude answers.</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				{error && (
					<Alert variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}
				{claude.prompts.length === 0 ? (
					<p className="text-sm text-muted-foreground">No enabled prompts yet — add prompts first.</p>
				) : (
					<div className="divide-y">
						{claude.prompts.map((prompt) => (
							<div key={prompt.id} className="flex items-center justify-between gap-4 py-2">
								<span className="min-w-0 flex-1 truncate text-sm" title={prompt.value}>
									{prompt.value}
								</span>
								{busyPromptId === prompt.id ? (
									<IconLoader2 className="h-4 w-4 animate-spin text-muted-foreground" />
								) : (
									<Select
										value={prompt.claudeMode ?? "off"}
										onValueChange={(value) =>
											setMode(prompt.id, value === "off" ? null : (value as "base" | "web"))
										}
									>
										<SelectTrigger className="w-40" size="sm">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="off">Off</SelectItem>
											<SelectItem value="web" disabled={prompt.claudeMode === null && remaining <= 0}>
												Web-grounded
											</SelectItem>
											<SelectItem value="base" disabled={prompt.claudeMode === null && remaining <= 0}>
												Base model
											</SelectItem>
										</SelectContent>
									</Select>
								)}
							</div>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
