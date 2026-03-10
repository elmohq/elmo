/**
 * /app/$brand/settings/competitors - Competitor management page
 *
 * Form to manage competitor list (name + domain pairs).
 */
import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { getAppName, getBrandName, buildTitle } from "@/lib/route-head";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { useBrand, useCompetitors } from "@/hooks/use-brands";
import { updateCompetitors } from "@/server/brands";
import { Plus, X, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert";
import { MAX_COMPETITORS } from "@workspace/lib/constants";

interface CompetitorEntry {
	_key: string;
	name: string;
	domain: string;
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
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState("");
	const [success, setSuccess] = useState("");
	const [competitors, setCompetitors] = useState<CompetitorEntry[]>([]);

	useEffect(() => {
		if (existingCompetitors.length > 0) {
			setCompetitors(
				existingCompetitors.map((c) => ({
					_key: crypto.randomUUID(),
					name: c.name,
					domain: c.domain,
				})),
			);
		}
	}, [existingCompetitors]);

	const addCompetitor = () => {
		if (competitors.length < MAX_COMPETITORS) {
			setCompetitors([...competitors, { _key: crypto.randomUUID(), name: "", domain: "" }]);
		}
	};

	const removeCompetitor = (index: number) => {
		setCompetitors(competitors.filter((_, i) => i !== index));
	};

	const updateCompetitor = (index: number, field: keyof CompetitorEntry, value: string) => {
		const updated = [...competitors];
		updated[index] = { ...updated[index], [field]: value };
		setCompetitors(updated);
	};

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
			const validCompetitors = competitors.filter((c) => c.name.trim() && c.domain.trim());

			await updateCompetitors({
				data: { brandId: brand.id, competitors: validCompetitors },
			});

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
					Updating competitors will only apply to future prompt evaluations.
				</AlertDescription>
			</Alert>

			<form onSubmit={handleSubmit} className="space-y-6">
				<div className="space-y-4">
					{competitors.map((competitor, index) => (
						<div key={competitor._key} className="flex gap-2 items-center p-3 border rounded-lg">
							<Input
								type="text"
								value={competitor.name}
								onChange={(e) => updateCompetitor(index, "name", e.target.value)}
								placeholder="Competitor name"
								className="flex-1"
								disabled={isSubmitting}
							/>
							<Input
								type="text"
								value={competitor.domain}
								onChange={(e) => updateCompetitor(index, "domain", e.target.value)}
								placeholder="domain.com"
								className="flex-1"
								disabled={isSubmitting}
							/>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => removeCompetitor(index)}
								className="p-2 cursor-pointer"
								disabled={isSubmitting}
							>
								<X className="h-4 w-4" />
							</Button>
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
						<strong>
							{competitors.filter((c) => c.name.trim() && c.domain.trim()).length}/{MAX_COMPETITORS}
						</strong>{" "}
						competitors configured
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
