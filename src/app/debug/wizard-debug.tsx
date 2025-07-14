"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface WizardResults {
	getKeywords?: any;
	getCompetitors?: any;
	getPersonas?: any;
}

export default function WizardDebug() {
	const [website, setWebsite] = useState("https://example.com");
	const [analyzeWebsiteData, setAnalyzeWebsiteData] = useState("");
	const [results, setResults] = useState<WizardResults>({});
	const [loading, setLoading] = useState<Record<string, boolean>>({});

	const setLoadingState = (key: string, isLoading: boolean) => {
		setLoading(prev => ({ ...prev, [key]: isLoading }));
	};

	const analyzeWebsite = async () => {
		if (!website) {
			alert("Please enter a website URL");
			return null;
		}

		setLoadingState('analyzeWebsite', true);
		try {
			const response = await fetch("/api/wizard/analyze-website", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ website }),
			});

			if (!response.ok) throw new Error(`Failed to analyze website: ${response.statusText}`);
			const data = await response.json();
			setAnalyzeWebsiteData(JSON.stringify(data, null, 2));
			return data;
		} catch (error) {
			console.error("Error analyzing website:", error);
			const errorData = { error: error instanceof Error ? error.message : "Unknown error" };
			setAnalyzeWebsiteData(JSON.stringify(errorData, null, 2));
			return null;
		} finally {
			setLoadingState('analyzeWebsite', false);
		}
	};

	const getAnalyzeWebsiteData = async () => {
		if (analyzeWebsiteData.trim()) {
			// Use existing data from textarea
			try {
				return JSON.parse(analyzeWebsiteData);
			} catch (error) {
				alert("Invalid JSON in analyze website data. Please fix or clear it to auto-run.");
				return null;
			}
		} else {
			// Auto-run analyze website
			return await analyzeWebsite();
		}
	};

	const getKeywords = async () => {
		if (!website) {
			alert("Please enter a website URL");
			return;
		}

		setLoadingState('getKeywords', true);
		try {
			const response = await fetch("/api/wizard/get-keywords", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ domain: website }),
			});

			if (!response.ok) throw new Error(`Failed to get keywords: ${response.statusText}`);
			const data = await response.json();
			setResults(prev => ({ ...prev, getKeywords: data }));
		} catch (error) {
			console.error("Error getting keywords:", error);
			setResults(prev => ({ ...prev, getKeywords: { error: error instanceof Error ? error.message : "Unknown error" } }));
		} finally {
			setLoadingState('getKeywords', false);
		}
	};

	const getCompetitors = async () => {
		if (!website) {
			alert("Please enter a website URL");
			return;
		}

		// Get analyze website data (either from textarea or by running the API)
		const websiteData = await getAnalyzeWebsiteData();
		if (!websiteData?.products || !Array.isArray(websiteData.products) || websiteData.products.length === 0) {
			alert("Failed to get products data from website analysis");
			return;
		}

		setLoadingState('getCompetitors', true);
		try {
			const response = await fetch("/api/wizard/get-competitors", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ products: websiteData.products, website }),
			});

			if (!response.ok) throw new Error(`Failed to get competitors: ${response.statusText}`);
			const data = await response.json();
			setResults(prev => ({ ...prev, getCompetitors: data }));
		} catch (error) {
			console.error("Error getting competitors:", error);
			setResults(prev => ({ ...prev, getCompetitors: { error: error instanceof Error ? error.message : "Unknown error" } }));
		} finally {
			setLoadingState('getCompetitors', false);
		}
	};

	const getPersonas = async () => {
		if (!website) {
			alert("Please enter a website URL");
			return;
		}

		// Get analyze website data (either from textarea or by running the API)
		const websiteData = await getAnalyzeWebsiteData();
		if (!websiteData?.products || !Array.isArray(websiteData.products) || websiteData.products.length === 0) {
			alert("Failed to get products data from website analysis");
			return;
		}

		setLoadingState('getPersonas', true);
		try {
			const response = await fetch("/api/wizard/get-personas", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ products: websiteData.products }),
			});

			if (!response.ok) throw new Error(`Failed to get personas: ${response.statusText}`);
			const data = await response.json();
			setResults(prev => ({ ...prev, getPersonas: data }));
		} catch (error) {
			console.error("Error getting personas:", error);
			setResults(prev => ({ ...prev, getPersonas: { error: error instanceof Error ? error.message : "Unknown error" } }));
		} finally {
			setLoadingState('getPersonas', false);
		}
	};

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Wizard API Testing</CardTitle>
					<CardDescription>Test the individual wizard API endpoints for debugging purposes</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="website">Website URL</Label>
						<Input
							id="website"
							type="url"
							value={website}
							onChange={(e) => setWebsite(e.target.value)}
							placeholder=""
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="analyzeData">Analyze Website Data (leave empty to auto-run)</Label>
						<textarea
							id="analyzeData"
							className="w-full h-64 p-3 border rounded-md font-mono text-sm bg-muted"
							value={analyzeWebsiteData}
							onChange={(e) => setAnalyzeWebsiteData(e.target.value)}
							placeholder="JSON data from analyze website will appear here. You can modify it before running other steps."
						/>
					</div>

					<div className="flex flex-wrap gap-2">
						<Button
							onClick={analyzeWebsite}
							disabled={loading.analyzeWebsite || !website}
							className="flex items-center gap-2 cursor-pointer"
						>
							{loading.analyzeWebsite && <Loader2 className="h-4 w-4 animate-spin" />}
							Analyze Website
						</Button>

						<Button
							onClick={getKeywords}
							disabled={loading.getKeywords || !website}
							className="flex items-center gap-2 cursor-pointer"
						>
							{loading.getKeywords && <Loader2 className="h-4 w-4 animate-spin" />}
							Get Keywords
						</Button>

						<Button
							onClick={getCompetitors}
							disabled={loading.getCompetitors || !website}
							className="flex items-center gap-2 cursor-pointer"
						>
							{loading.getCompetitors && <Loader2 className="h-4 w-4 animate-spin" />}
							Get Competitors
						</Button>

						<Button
							onClick={getPersonas}
							disabled={loading.getPersonas || !website}
							className="flex items-center gap-2 cursor-pointer"
						>
							{loading.getPersonas && <Loader2 className="h-4 w-4 animate-spin" />}
							Get Personas
						</Button>
					</div>
				</CardContent>
			</Card>

			{/* Results Display */}
			{Object.entries(results).map(([key, data]) => (
				<Card key={key}>
					<CardHeader>
						<CardTitle className="capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</CardTitle>
					</CardHeader>
					<CardContent>
						<pre className="whitespace-pre-wrap text-sm bg-muted p-4 rounded overflow-auto max-h-96">
							{JSON.stringify(data, null, 2)}
						</pre>
					</CardContent>
				</Card>
			))}
		</div>
	);
} 