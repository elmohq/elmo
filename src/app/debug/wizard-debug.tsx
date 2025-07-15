"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Copy, Check } from "lucide-react";

interface WizardResults {
	getKeywords?: any;
	getCompetitors?: any;
	getPersonas?: any;
}

interface CSVData {
	run: number;
	brand: string;
	brandWebsite: string;
	productCategories: string;
	competitors: string;
	groups: string;
	seo: string;
}

export default function WizardDebug() {
	const [website, setWebsite] = useState("https://example.com");
	const [analyzeWebsiteData, setAnalyzeWebsiteData] = useState("");
	const [results, setResults] = useState<WizardResults>({});
	const [loading, setLoading] = useState<Record<string, boolean>>({});
	const [copied, setCopied] = useState<Record<string, boolean>>({});
	const [csvData, setCsvData] = useState<CSVData[]>([]);
	const [csvLoading, setCsvLoading] = useState(false);

	// Hardcoded brands for CSV generation
	const brands = [
		{ name: "Glossier", website: "https://www.glossier.com/" },
		{ name: "Beam Organics", website: "https://shopbeam.com/" },
		{ name: "BUFFED energy", website: "https://buffed.energy/" },
		{ name: "Whitelabel Client Store", website: "https://store.whitelabel-client.com/" },
		{ name: "U Beauty", website: "https://ubeauty.com/" },
	];

	const setLoadingState = (key: string, isLoading: boolean) => {
		setLoading(prev => ({ ...prev, [key]: isLoading }));
	};

	const copyToClipboard = async (text: string, key: string) => {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(prev => ({ ...prev, [key]: true }));
			setTimeout(() => {
				setCopied(prev => ({ ...prev, [key]: false }));
			}, 2000);
		} catch (err) {
			console.error('Failed to copy to clipboard:', err);
		}
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

		// Get analyze website data (either from textarea or by running the API)
		const websiteData = await getAnalyzeWebsiteData();
		if (!websiteData?.products || !Array.isArray(websiteData.products) || websiteData.products.length === 0) {
			alert("Failed to get products data from website analysis");
			return;
		}

		// Check if detailed analysis should be skipped
		if (websiteData.skipDetailedAnalysis) {
			setResults(prev => ({ ...prev, getKeywords: { keywords: [], message: "Skipped due to low domain rank" } }));
			return;
		}

		setLoadingState('getKeywords', true);
		try {
			const response = await fetch("/api/wizard/get-keywords", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ domain: website, products: websiteData.products }),
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

		// Check if detailed analysis should be skipped
		if (websiteData.skipDetailedAnalysis) {
			setResults(prev => ({ ...prev, getCompetitors: { competitors: [], message: "Skipped due to low domain rank" } }));
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

		// Check if detailed analysis should be skipped
		if (websiteData.skipDetailedAnalysis) {
			setResults(prev => ({ ...prev, getPersonas: { personaGroups: [], message: "Skipped due to low domain rank" } }));
			return;
		}

		setLoadingState('getPersonas', true);
		try {
			const response = await fetch("/api/wizard/get-personas", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ products: websiteData.products, website }),
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

	// Helper function to escape CSV content
	const escapeCSV = (value: string): string => {
		if (value.includes('"') || value.includes(',') || value.includes('\n') || value.includes('\r')) {
			return `"${value.replace(/"/g, '""')}"`;
		}
		return value;
	};

	// Helper function to call a single API
	const callAPI = async (endpoint: string, payload: any): Promise<any> => {
		const response = await fetch(endpoint, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});

		if (!response.ok) {
			throw new Error(`Failed to call ${endpoint}: ${response.statusText}`);
		}
		
		return await response.json();
	};

	// Generate CSV data for all brands and runs
	const generateCSV = async () => {
		setCsvLoading(true);
		const csvRows: CSVData[] = [];

		try {
			// Process each brand sequentially
			for (const brand of brands) {
				console.log(`Processing brand: ${brand.name}`);
				
				// Run 3 iterations for this brand sequentially
				for (let run = 1; run <= 3; run++) {
					console.log(`Starting run ${run} for ${brand.name}`);
					
					// Analyze website
					const analyzeResult = await callAPI("/api/wizard/analyze-website", { website: brand.website });
					const { products } = analyzeResult;
					
					if (!products || !Array.isArray(products) || products.length === 0) {
						console.error(`No products found for ${brand.name} (run ${run})`);
						csvRows.push({
							run,
							brand: brand.name,
							brandWebsite: brand.website,
							productCategories: JSON.stringify({ products: [] }, null, 2),
							competitors: JSON.stringify({ error: "No products found" }, null, 2),
							groups: JSON.stringify({ error: "No products found" }, null, 2),
							seo: JSON.stringify({ error: "No products found" }, null, 2),
						});
						continue;
					}

					// Run competitors, personas, and keywords in parallel
					const [competitorsResult, personasResult, keywordsResult] = await Promise.all([
						callAPI("/api/wizard/get-competitors", { products, website: brand.website }),
						callAPI("/api/wizard/get-personas", { products, website: brand.website }),
						callAPI("/api/wizard/get-keywords", { domain: brand.website, products }),
					]);

					csvRows.push({
						run,
						brand: brand.name,
						brandWebsite: brand.website,
						productCategories: JSON.stringify({ products }, null, 2),
						competitors: JSON.stringify(competitorsResult, null, 2),
						groups: JSON.stringify(personasResult, null, 2),
						seo: JSON.stringify(keywordsResult, null, 2),
					});
				}
			}

			setCsvData(csvRows);
		} catch (error) {
			console.error("Error generating CSV:", error);
			alert("Failed to generate CSV. Check console for details.");
		} finally {
			setCsvLoading(false);
		}
	};

	// Convert CSV data to string format
	const csvToString = (data: CSVData[]): string => {
		return data.map(row => 
			[
				row.run.toString(),
				escapeCSV(row.brand),
				escapeCSV(row.brandWebsite),
				escapeCSV(row.productCategories),
				escapeCSV(row.competitors),
				escapeCSV(row.groups),
				escapeCSV(row.seo),
			].join('\t')
		).join('\n');
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

			{/* CSV Generation Section */}
			<Card>
				<CardHeader>
					<CardTitle>CSV Generation</CardTitle>
					<CardDescription>
						Generate CSV with data for all brands across 3 runs. Includes: Run, Brand, Brand Website, Product Categories, Competitors, Groups, SEO
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						<Label>Brands to process:</Label>
						<ul className="text-sm text-muted-foreground">
							{brands.map(brand => (
								<li key={brand.name}>• {brand.name} ({brand.website})</li>
							))}
						</ul>
					</div>

					<Button
						onClick={generateCSV}
						disabled={csvLoading}
						className="flex items-center gap-2 cursor-pointer"
					>
						{csvLoading && <Loader2 className="h-4 w-4 animate-spin" />}
						Generate CSV Data (3 runs × 5 brands)
					</Button>

					{csvData.length > 0 && (
						<div className="space-y-4">
							<div className="flex items-center justify-between">
								<Label>CSV Preview ({csvData.length} rows)</Label>
								<Button
									variant="outline"
									size="sm"
									onClick={() => copyToClipboard(csvToString(csvData), 'csv')}
									className="flex items-center gap-2"
								>
									{copied.csv ? (
										<Check className="h-4 w-4 text-green-600" />
									) : (
										<Copy className="h-4 w-4" />
									)}
									{copied.csv ? 'Copied!' : 'Copy CSV'}
								</Button>
							</div>
							<div className="border rounded-md p-4 bg-muted max-h-96 overflow-auto">
								<pre className="text-xs font-mono whitespace-pre-wrap break-words">
									{csvToString(csvData)}
								</pre>
							</div>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Results Display */}
			{Object.entries(results).map(([key, data]) => (
				<Card key={key}>
					<CardHeader>
						<div className="flex items-center justify-between">
							<CardTitle className="capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</CardTitle>
							<Button
								variant="outline"
								size="sm"
								onClick={() => copyToClipboard(JSON.stringify(data, null, 2), key)}
								className="flex items-center gap-2"
							>
								{copied[key] ? (
									<Check className="h-4 w-4 text-green-600" />
								) : (
									<Copy className="h-4 w-4" />
								)}
								{copied[key] ? 'Copied!' : 'Copy'}
							</Button>
						</div>
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