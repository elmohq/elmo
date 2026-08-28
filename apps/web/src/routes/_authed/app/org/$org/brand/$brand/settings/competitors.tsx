/**
 * /app/$brand/settings/competitors - Competitor management page
 *
 * Form to manage competitor list with multiple domains and aliases per competitor.
 */

import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { type CompetitorEntry, CompetitorsEditor } from "@/components/competitors-editor";
import { useBrand, useCompetitors } from "@/hooks/use-brands";
import { citationKeys } from "@/hooks/use-citations";
import { dashboardKeys } from "@/hooks/use-dashboard-summary";
import { buildTitle, getAppName, getBrandName } from "@/lib/route-head";
import { updateCompetitors } from "@/server/brands";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/settings/competitors")({
	head: ({ matches, match }) => {
		const appName = getAppName(match);
		const brandName = getBrandName(matches);
		return {
			meta: [
				{ title: buildTitle("Competitors", { appName, subject: brandName }) },
				{ name: "description", content: "Manage your tracked competitors." },
			],
		};
	},
	component: CompetitorsSettingsPage,
});

function CompetitorsSettingsPage() {
	const { brandId } = Route.useRouteContext();
	const { brand, isLoading } = useBrand(brandId);
	const { competitors: existingCompetitors, isLoading: competitorsLoading } = useCompetitors(brandId);
	const queryClient = useQueryClient();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState("");
	const [success, setSuccess] = useState("");
	const [competitors, setCompetitors] = useState<CompetitorEntry[]>([]);
	useEffect(() => {
		if (existingCompetitors.length > 0) {
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
	}, [existingCompetitors]);

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
					Updating competitors will only apply to future prompt evaluations. Citation categorization updates
					retroactively.
				</AlertDescription>
			</Alert>

			<form onSubmit={handleSubmit} className="space-y-6">
				<CompetitorsEditor competitors={competitors} onChange={setCompetitors} disabled={isSubmitting} />

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
