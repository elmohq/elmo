"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePromptRuns } from "@/hooks/use-prompt-runs";
import { useBrand, useCompetitors } from "@/hooks/use-brands";
import { calculateVisibilityPercentages } from "@/lib/chart-utils";

export default function ChartDebug() {
	const [selectedBrandId, setSelectedBrandId] = useState("foo");
	const [selectedLookback, setSelectedLookback] = useState<"1w" | "1m" | "3m">("1w");

	const { brand, isLoading: brandLoading } = useBrand(selectedBrandId);
	const { competitors, isLoading: competitorsLoading } = useCompetitors(selectedBrandId);
	const { promptRuns, isLoading: runsLoading } = usePromptRuns(selectedBrandId, { lookback: selectedLookback });

	const handleDebugChart = () => {
		console.log("=== CHART DEBUG INFO ===");
		console.log("Brand:", brand);
		console.log("Competitors:", competitors);
		console.log("Prompt Runs:", promptRuns);
		console.log("Raw prompt runs data:", JSON.stringify(promptRuns, null, 2));

		if (brand && competitors && promptRuns) {
			console.log("Filtering for prompt ID: 4f7bedc1-655e-45cd-ad03-f0b8b10f0edc");
			const filteredRuns = promptRuns.filter((run) => run.promptId === "4f7bedc1-655e-45cd-ad03-f0b8b10f0edc");
			console.log("Filtered prompt runs:", filteredRuns);

			const chartData = calculateVisibilityPercentages(filteredRuns, brand, competitors, selectedLookback);
			console.log("Generated chart data:", chartData);

			// Check each run in detail
			filteredRuns.forEach((run, index) => {
				console.log(`Run ${index + 1}:`, {
					id: run.id,
					promptId: run.promptId,
					createdAt: run.createdAt,
					brandMentioned: run.brandMentioned,
					competitorsMentioned: run.competitorsMentioned,
					competitorsMentionedType: typeof run.competitorsMentioned,
					webSearchEnabled: run.webSearchEnabled,
				});
			});
		}
	};

	const handleFetchRawData = async () => {
		console.log("=== FETCHING RAW API DATA ===");

		try {
			// Fetch prompt runs directly from API
			const response = await fetch(`/api/brands/${selectedBrandId}/prompt-runs?lookback=${selectedLookback}`);
			const data = await response.json();
			console.log("Raw API response:", data);

			// Fetch competitors directly from API
			const competitorsResponse = await fetch(`/api/brands/${selectedBrandId}/competitors`);
			const competitorsData = await competitorsResponse.json();
			console.log("Raw competitors API response:", competitorsData);

			// Fetch brand directly from API
			const brandResponse = await fetch(`/api/brands/${selectedBrandId}`);
			const brandData = await brandResponse.json();
			console.log("Raw brand API response:", brandData);
		} catch (error) {
			console.error("Error fetching raw data:", error);
		}
	};

	return (
		<div className="container mx-auto p-6 space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Chart Debug Tool</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex gap-4 items-center">
						<div>
							<label className="block text-sm font-medium mb-2">Brand ID:</label>
							<input
								type="text"
								value={selectedBrandId}
								onChange={(e) => setSelectedBrandId(e.target.value)}
								className="border rounded px-3 py-2"
								placeholder="Enter brand ID"
							/>
						</div>

						<div>
							<label className="block text-sm font-medium mb-2">Lookback:</label>
							<select
								value={selectedLookback}
								onChange={(e) => setSelectedLookback(e.target.value as "1w" | "1m" | "3m")}
								className="border rounded px-3 py-2"
							>
								<option value="1w">1 Week</option>
								<option value="1m">1 Month</option>
								<option value="3m">3 Months</option>
							</select>
						</div>
					</div>

					<div className="flex gap-4">
						<Button onClick={handleDebugChart} variant="outline">
							Debug Chart Calculation
						</Button>
						<Button onClick={handleFetchRawData} variant="outline">
							Fetch Raw API Data
						</Button>
					</div>

					<div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
						<Card>
							<CardHeader>
								<CardTitle className="text-sm">Brand Data</CardTitle>
							</CardHeader>
							<CardContent>
								{brandLoading ? (
									<p>Loading...</p>
								) : (
									<pre className="text-xs overflow-auto max-h-40">{JSON.stringify(brand, null, 2)}</pre>
								)}
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle className="text-sm">Competitors Data</CardTitle>
							</CardHeader>
							<CardContent>
								{competitorsLoading ? (
									<p>Loading...</p>
								) : (
									<pre className="text-xs overflow-auto max-h-40">{JSON.stringify(competitors, null, 2)}</pre>
								)}
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle className="text-sm">Prompt Runs Data</CardTitle>
							</CardHeader>
							<CardContent>
								{runsLoading ? (
									<p>Loading...</p>
								) : (
									<pre className="text-xs overflow-auto max-h-40">
										{JSON.stringify(promptRuns?.slice(0, 3), null, 2)}
										{promptRuns && promptRuns.length > 3 && (
											<p className="mt-2 text-gray-500">...and {promptRuns.length - 3} more</p>
										)}
									</pre>
								)}
							</CardContent>
						</Card>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
