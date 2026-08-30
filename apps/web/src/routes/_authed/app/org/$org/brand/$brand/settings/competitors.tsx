import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert";
import { AlertTriangle } from "lucide-react";
import { useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { type CompetitorEntry, CompetitorsEditor } from "@/components/competitors-editor";
import { UnsavedChangesBar } from "@/components/unsaved-changes-bar";
import { useBrand, useCompetitors } from "@/hooks/use-brands";
import { citationKeys } from "@/hooks/use-citations";
import { dashboardKeys } from "@/hooks/use-dashboard-summary";
import { pageHead } from "@/lib/route-head";
import { useWriteErrorMessage } from "@/lib/write-errors";
import { updateCompetitors } from "@/server/brands";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/settings/competitors")({
	staticData: { crumb: "Competitors" },
	head: pageHead({ description: "Manage your tracked competitors." }),
	component: CompetitorsSettingsPage,
});

function saveable(competitors: CompetitorEntry[]) {
	return competitors
		.filter((c) => c.name.trim() && c.domains.some((d) => d.trim()))
		.map((c) => ({
			name: c.name.trim(),
			domains: c.domains.map((d) => d.trim()).filter(Boolean),
			aliases: c.aliases.map((a) => a.trim()).filter(Boolean),
		}));
}

function CompetitorsSettingsPage() {
	const { brandId } = Route.useRouteContext();
	const { brand, isLoading } = useBrand(brandId);
	const { competitors: existingCompetitors, isLoading: competitorsLoading, revalidate } = useCompetitors(brandId);
	const queryClient = useQueryClient();
	const writeError = useWriteErrorMessage();

	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [competitors, setCompetitors] = useState<CompetitorEntry[]>([]);

	const [seededFrom, setSeededFrom] = useState<unknown>(null);
	if (!competitorsLoading && existingCompetitors !== seededFrom) {
		setSeededFrom(existingCompetitors);
		setCompetitors(
			existingCompetitors.map((c) => ({
				_key: uuidv4(),
				name: c.name,
				domains: c.domains ?? [],
				aliases: c.aliases || [],
				expanded: false,
			})),
		);
	}

	const baseline = useMemo(
		() =>
			existingCompetitors.map((c) => ({
				name: c.name,
				domains: c.domains ?? [],
				aliases: c.aliases || [],
			})),
		[existingCompetitors],
	);
	const pending = saveable(competitors);
	const isDirty = JSON.stringify(pending) !== JSON.stringify(baseline);

	if (isLoading || competitorsLoading) {
		return (
			<div className="space-y-6">
				<h1 className="text-3xl font-bold">Competitors</h1>
				<p className="text-muted-foreground">Loading...</p>
			</div>
		);
	}

	if (!brand) {
		return (
			<div className="space-y-6">
				<h1 className="text-3xl font-bold">Competitors</h1>
				<p className="text-destructive">Brand not found</p>
			</div>
		);
	}

	const save = async () => {
		setIsSaving(true);
		setError(null);
		try {
			await updateCompetitors({ data: { brandId: brand.id, competitors: pending } });

			queryClient.invalidateQueries({ queryKey: citationKeys.all });
			queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
			await revalidate();
		} catch (err) {
			setError(writeError(err, "Failed to save competitors."));
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<div className="max-w-2xl space-y-6">
			<div>
				<h1 className="text-3xl font-bold">Competitors</h1>
				<p className="text-muted-foreground">Manage your competitive landscape for reputation tracking.</p>
			</div>

			<Alert variant="default" className="border-yellow-200 bg-yellow-50 text-yellow-800">
				<AlertTriangle className="h-4 w-4 text-yellow-600" />
				<AlertTitle>Warning</AlertTitle>
				<AlertDescription className="text-yellow-700">
					Updating competitors will only apply to future prompt evaluations. Citation categorization updates
					retroactively.
				</AlertDescription>
			</Alert>

			<CompetitorsEditor competitors={competitors} onChange={setCompetitors} disabled={isSaving} />

			<UnsavedChangesBar
				isDirty={isDirty}
				isSaving={isSaving}
				error={error}
				onSave={save}
				onDiscard={() => {
					setSeededFrom(null);
					setError(null);
				}}
			/>
		</div>
	);
}
