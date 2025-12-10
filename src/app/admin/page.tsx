"use client";

import { useEffect, useState } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Settings, TrendingUp, TrendingDown, ArrowLeft, Search, Sparkles, Loader2, Copy, Check } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer } from "recharts";

interface BrandStats {
	id: string;
	name: string;
	website: string;
	enabled: boolean;
	onboarded: boolean;
	delayOverrideMs: number | null;
	createdAt: string;
	updatedAt: string;
	totalPrompts: number;
	activePrompts: number;
	promptRuns7Days: number;
	promptRuns30Days: number;
	lastPromptRunAt: string | null;
	promptsAddedLast7Days: number;
	promptsRemovedLast7Days: number;
	promptsAddedLast30Days: number;
	promptsRemovedLast30Days: number;
}

const DEFAULT_DELAY_MS = 3 * 24 * 60 * 60 * 1000; // 3 days in milliseconds

function formatDelay(ms: number): string {
	const weeks = Math.floor(ms / (7 * 24 * 60 * 60 * 1000));
	const days = Math.floor((ms % (7 * 24 * 60 * 60 * 1000)) / (24 * 60 * 60 * 1000));
	const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
	const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
	
	const parts: string[] = [];
	if (weeks > 0) parts.push(`${weeks}w`);
	if (days > 0) parts.push(`${days}d`);
	if (hours > 0) parts.push(`${hours}h`);
	if (minutes > 0) parts.push(`${minutes}m`);
	
	return parts.length > 0 ? parts.join(" ") : "0m";
}

function msToTimeUnits(ms: number): { weeks: number; days: number; hours: number; minutes: number; seconds: number; milliseconds: number } {
	const weeks = Math.floor(ms / (7 * 24 * 60 * 60 * 1000));
	let remainder = ms % (7 * 24 * 60 * 60 * 1000);
	
	const days = Math.floor(remainder / (24 * 60 * 60 * 1000));
	remainder = remainder % (24 * 60 * 60 * 1000);
	
	const hours = Math.floor(remainder / (60 * 60 * 1000));
	remainder = remainder % (60 * 60 * 1000);
	
	const minutes = Math.floor(remainder / (60 * 1000));
	remainder = remainder % (60 * 1000);
	
	const seconds = Math.floor(remainder / 1000);
	const milliseconds = remainder % 1000;
	
	return { weeks, days, hours, minutes, seconds, milliseconds };
}

function timeUnitsToMs(units: { weeks: number; days: number; hours: number; minutes: number; seconds: number; milliseconds: number }): number {
	return (
		units.weeks * 7 * 24 * 60 * 60 * 1000 +
		units.days * 24 * 60 * 60 * 1000 +
		units.hours * 60 * 60 * 1000 +
		units.minutes * 60 * 1000 +
		units.seconds * 1000 +
		units.milliseconds
	);
}

function DelayOverrideDialog({ brand, onUpdate }: { brand: BrandStats; onUpdate: () => void }) {
	const [open, setOpen] = useState(false);
	const [timeUnits, setTimeUnits] = useState({ weeks: 0, days: 0, hours: 0, minutes: 0, seconds: 0, milliseconds: 0 });
	const [isUpdating, setIsUpdating] = useState(false);
	const [error, setError] = useState<string | null>(null);
	
	const currentDelay = brand.delayOverrideMs ?? DEFAULT_DELAY_MS;
	
	useEffect(() => {
		if (open) {
			// Pre-fill with current value
			setTimeUnits(msToTimeUnits(currentDelay));
			setError(null);
		}
	}, [open, currentDelay]);
	
	const handleUpdateUnit = (unit: keyof typeof timeUnits, value: string) => {
		const numValue = value === "" ? 0 : Math.max(0, parseInt(value) || 0);
		setTimeUnits({ ...timeUnits, [unit]: numValue });
	};
	
	const handleUpdate = async () => {
		setError(null);
		
		const totalMs = timeUnitsToMs(timeUnits);
		
		if (totalMs === 0) {
			setError("Please enter a delay value");
			return;
		}
		
		if (totalMs < 60 * 60 * 1000) {
			setError("Delay must be at least 1 hour");
			return;
		}
		
		setIsUpdating(true);
		
		try {
			const response = await fetch(`/api/admin/brands/${brand.id}/delay-override`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ delayOverrideMs: totalMs }),
			});
			
			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || "Failed to update delay override");
			}
			
			onUpdate();
			setOpen(false);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to update");
		} finally {
			setIsUpdating(false);
		}
	};
	
	const handleClearOverride = async () => {
		setIsUpdating(true);
		setError(null);
		
		try {
			const response = await fetch(`/api/admin/brands/${brand.id}/delay-override`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ delayOverrideMs: null }),
			});
			
			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || "Failed to clear override");
			}
			
			onUpdate();
			setOpen(false);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to clear override");
		} finally {
			setIsUpdating(false);
		}
	};
	
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm" className="cursor-pointer">
					<Settings className="h-4 w-4" />
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>Configure Job Delay for {brand.name}</DialogTitle>
					<DialogDescription>
						Set a custom delay for how often prompt jobs run. Default is {formatDelay(DEFAULT_DELAY_MS)}.
					</DialogDescription>
				</DialogHeader>
				
				<div className="space-y-4 py-4">
					<div className="space-y-3">
						<Label>Custom Delay</Label>
						<div className="grid grid-cols-3 gap-4">
							<div className="space-y-2">
								<Label htmlFor="weeks" className="text-xs text-muted-foreground">Weeks</Label>
								<Input
									id="weeks"
									type="number"
									min="0"
									value={timeUnits.weeks || ""}
									onChange={(e) => handleUpdateUnit("weeks", e.target.value)}
									disabled={isUpdating}
									placeholder="0"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="days" className="text-xs text-muted-foreground">Days</Label>
								<Input
									id="days"
									type="number"
									min="0"
									value={timeUnits.days || ""}
									onChange={(e) => handleUpdateUnit("days", e.target.value)}
									disabled={isUpdating}
									placeholder="0"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="hours" className="text-xs text-muted-foreground">Hours</Label>
								<Input
									id="hours"
									type="number"
									min="0"
									value={timeUnits.hours || ""}
									onChange={(e) => handleUpdateUnit("hours", e.target.value)}
									disabled={isUpdating}
									placeholder="0"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="minutes" className="text-xs text-muted-foreground">Minutes</Label>
								<Input
									id="minutes"
									type="number"
									min="0"
									value={timeUnits.minutes || ""}
									onChange={(e) => handleUpdateUnit("minutes", e.target.value)}
									disabled={isUpdating}
									placeholder="0"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="seconds" className="text-xs text-muted-foreground">Seconds</Label>
								<Input
									id="seconds"
									type="number"
									min="0"
									value={timeUnits.seconds || ""}
									onChange={(e) => handleUpdateUnit("seconds", e.target.value)}
									disabled={isUpdating}
									placeholder="0"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="milliseconds" className="text-xs text-muted-foreground">Milliseconds</Label>
								<Input
									id="milliseconds"
									type="number"
									min="0"
									value={timeUnits.milliseconds || ""}
									onChange={(e) => handleUpdateUnit("milliseconds", e.target.value)}
									disabled={isUpdating}
									placeholder="0"
								/>
							</div>
						</div>
						<p className="text-sm text-muted-foreground">
							Current: <strong>{formatDelay(currentDelay)}</strong>
							{brand.delayOverrideMs !== null && " (custom)"}
							{brand.delayOverrideMs === null && " (default)"}
						</p>
						<p className="text-sm text-muted-foreground">
							Total: <strong>{formatDelay(timeUnitsToMs(timeUnits))}</strong>
						</p>
					</div>
					
					{error && (
						<p className="text-sm text-destructive">{error}</p>
					)}
				</div>
				
				<DialogFooter>
					<div className="flex justify-between w-full">
						{brand.delayOverrideMs !== null && (
							<Button
								variant="outline"
								onClick={handleClearOverride}
								disabled={isUpdating}
								className="cursor-pointer"
							>
								Clear Override
							</Button>
						)}
						<div className="flex gap-2 ml-auto">
							<Button 
								variant="outline" 
								onClick={() => setOpen(false)} 
								disabled={isUpdating}
								className="cursor-pointer"
							>
								Cancel
							</Button>
							<Button 
								onClick={handleUpdate} 
								disabled={isUpdating}
								className="cursor-pointer"
							>
								{isUpdating ? "Updating..." : "Update"}
							</Button>
						</div>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

interface CompetitorResult {
	name: string;
	domain: string;
}

interface AnalyzeDomainResult {
	products: string[];
	domainTraffic: number;
	skipDetailedAnalysis?: boolean;
	competitors: CompetitorResult[];
}

interface GeneratePromptsResult {
	brandName: string;
	products: string[];
	domainTraffic: number;
	competitors: CompetitorResult[];
	prompts: { prompt: string; brandedPrompt: boolean }[];
}

function AnalyzeDomainDialog() {
	const [open, setOpen] = useState(false);
	const [website, setWebsite] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [result, setResult] = useState<AnalyzeDomainResult | null>(null);
	const [copied, setCopied] = useState(false);
	
	const handleAnalyze = async () => {
		if (!website.trim()) {
			setError("Please enter a website URL");
			return;
		}
		
		setError(null);
		setResult(null);
		setIsLoading(true);
		
		try {
			const response = await fetch("/api/admin/wizard/analyze-domain", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ website: website.trim() }),
			});
			
			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || "Failed to analyze domain");
			}
			
			const data = await response.json();
			setResult(data);
		} catch (err) {
			setError(err instanceof Error ? err.message : "An error occurred");
		} finally {
			setIsLoading(false);
		}
	};
	
	const handleCopy = async () => {
		if (!result) return;
		const text = JSON.stringify(result, null, 2);
		await navigator.clipboard.writeText(text);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};
	
	const handleClose = () => {
		setOpen(false);
		setWebsite("");
		setResult(null);
		setError(null);
	};
	
	return (
		<Dialog open={open} onOpenChange={(o) => o ? setOpen(true) : handleClose()}>
			<DialogTrigger asChild>
				<Button variant="outline" className="cursor-pointer">
					<Search className="h-4 w-4 mr-2" />
					Analyze Domain
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Analyze Domain</DialogTitle>
					<DialogDescription>
						Get products and competitors for a website domain.
					</DialogDescription>
				</DialogHeader>
				
				<div className="space-y-4 py-4">
					<div className="space-y-2">
						<Label htmlFor="analyze-website">Website URL</Label>
						<div className="flex gap-2">
							<Input
								id="analyze-website"
								placeholder="https://example.com"
								value={website}
								onChange={(e) => setWebsite(e.target.value)}
								disabled={isLoading}
								onKeyDown={(e) => e.key === "Enter" && !isLoading && handleAnalyze()}
							/>
							<Button onClick={handleAnalyze} disabled={isLoading} className="cursor-pointer">
								{isLoading ? (
									<>
										<Loader2 className="h-4 w-4 mr-2 animate-spin" />
										Analyzing...
									</>
								) : (
									"Analyze"
								)}
							</Button>
						</div>
					</div>
					
					{error && (
						<p className="text-sm text-destructive">{error}</p>
					)}
					
					{result && (
						<div className="space-y-4">
							<div className="flex items-center justify-between">
								<h4 className="font-semibold">Results</h4>
								<Button variant="ghost" size="sm" onClick={handleCopy} className="cursor-pointer">
									{copied ? (
										<><Check className="h-4 w-4 mr-1" /> Copied</>
									) : (
										<><Copy className="h-4 w-4 mr-1" /> Copy JSON</>
									)}
								</Button>
							</div>
							
							<div className="space-y-3 text-sm">
								<div>
									<Label className="text-muted-foreground">Domain Traffic</Label>
									<p className="font-medium">{result.domainTraffic.toLocaleString()}</p>
								</div>
								
								<div>
									<Label className="text-muted-foreground">Products ({result.products.length})</Label>
									<div className="flex flex-wrap gap-1 mt-1">
										{result.products.map((product, i) => (
											<Badge key={i} variant="secondary">{product}</Badge>
										))}
									</div>
								</div>
								
								<div>
									<Label className="text-muted-foreground">Competitors ({result.competitors.length})</Label>
									<div className="mt-1 space-y-1">
										{result.competitors.length === 0 ? (
											<p className="text-muted-foreground">No competitors found</p>
										) : (
											result.competitors.map((c, i) => (
												<div key={i} className="flex items-center gap-2">
													<span className="font-medium">{c.name}</span>
													<span className="text-muted-foreground">({c.domain})</span>
												</div>
											))
										)}
									</div>
								</div>
							</div>
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}

function GeneratePromptsDialog() {
	const [open, setOpen] = useState(false);
	const [website, setWebsite] = useState("");
	const [brandName, setBrandName] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [result, setResult] = useState<GeneratePromptsResult | null>(null);
	const [copied, setCopied] = useState(false);
	
	const handleGenerate = async () => {
		if (!website.trim()) {
			setError("Please enter a website URL");
			return;
		}
		
		setError(null);
		setResult(null);
		setIsLoading(true);
		
		try {
			const response = await fetch("/api/admin/wizard/generate-prompts", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ 
					website: website.trim(),
					brandName: brandName.trim() || undefined,
				}),
			});
			
			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || "Failed to generate prompts");
			}
			
			const data = await response.json();
			setResult(data);
		} catch (err) {
			setError(err instanceof Error ? err.message : "An error occurred");
		} finally {
			setIsLoading(false);
		}
	};
	
	const handleCopyPrompts = async () => {
		if (!result) return;
		const text = result.prompts.map(p => p.prompt).join("\n");
		await navigator.clipboard.writeText(text);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};
	
	const handleCopyJson = async () => {
		if (!result) return;
		const text = JSON.stringify(result, null, 2);
		await navigator.clipboard.writeText(text);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};
	
	const handleClose = () => {
		setOpen(false);
		setWebsite("");
		setBrandName("");
		setResult(null);
		setError(null);
	};
	
	const brandedCount = result?.prompts.filter(p => p.brandedPrompt).length ?? 0;
	const unbrandedCount = result?.prompts.filter(p => !p.brandedPrompt).length ?? 0;
	
	return (
		<Dialog open={open} onOpenChange={(o) => o ? setOpen(true) : handleClose()}>
			<DialogTrigger asChild>
				<Button variant="outline" className="cursor-pointer">
					<Sparkles className="h-4 w-4 mr-2" />
					Generate Prompts
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Generate Prompts</DialogTitle>
					<DialogDescription>
						Generate candidate prompts for a domain based on its products and competitors.
					</DialogDescription>
				</DialogHeader>
				
				<div className="space-y-4 py-4">
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label htmlFor="generate-website">Website URL</Label>
							<Input
								id="generate-website"
								placeholder="https://example.com"
								value={website}
								onChange={(e) => setWebsite(e.target.value)}
								disabled={isLoading}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="generate-brand">Brand Name (optional)</Label>
							<Input
								id="generate-brand"
								placeholder="Auto-detected from URL"
								value={brandName}
								onChange={(e) => setBrandName(e.target.value)}
								disabled={isLoading}
							/>
						</div>
					</div>
					
					<Button onClick={handleGenerate} disabled={isLoading} className="cursor-pointer w-full">
						{isLoading ? (
							<>
								<Loader2 className="h-4 w-4 mr-2 animate-spin" />
								Generating prompts... (this may take a minute)
							</>
						) : (
							"Generate Prompts"
						)}
					</Button>
					
					{error && (
						<p className="text-sm text-destructive">{error}</p>
					)}
					
					{result && (
						<div className="space-y-4">
							<div className="flex items-center justify-between">
								<h4 className="font-semibold">
									Generated {result.prompts.length} prompts for {result.brandName}
								</h4>
								<div className="flex gap-2">
									<Button variant="ghost" size="sm" onClick={handleCopyPrompts} className="cursor-pointer">
										{copied ? (
											<><Check className="h-4 w-4 mr-1" /> Copied</>
										) : (
											<><Copy className="h-4 w-4 mr-1" /> Copy Prompts</>
										)}
									</Button>
									<Button variant="ghost" size="sm" onClick={handleCopyJson} className="cursor-pointer">
										<Copy className="h-4 w-4 mr-1" /> Copy JSON
									</Button>
								</div>
							</div>
							
							<div className="grid grid-cols-3 gap-4 text-sm">
								<div>
									<Label className="text-muted-foreground">Traffic</Label>
									<p className="font-medium">{result.domainTraffic.toLocaleString()}</p>
								</div>
								<div>
									<Label className="text-muted-foreground">Unbranded Prompts</Label>
									<p className="font-medium">{unbrandedCount}</p>
								</div>
								<div>
									<Label className="text-muted-foreground">Branded Prompts</Label>
									<p className="font-medium">{brandedCount}</p>
								</div>
							</div>
							
							<div className="space-y-2">
								<Label className="text-muted-foreground">Products</Label>
								<div className="flex flex-wrap gap-1">
									{result.products.map((product, i) => (
										<Badge key={i} variant="secondary">{product}</Badge>
									))}
								</div>
							</div>
							
							<div className="space-y-2">
								<Label className="text-muted-foreground">Competitors</Label>
								<div className="flex flex-wrap gap-1">
									{result.competitors.map((c, i) => (
										<Badge key={i} variant="outline">{c.name}</Badge>
									))}
								</div>
							</div>
							
							<div className="space-y-2">
								<Label className="text-muted-foreground">Prompts</Label>
								<div className="max-h-60 overflow-y-auto border rounded-md p-2 space-y-1 text-sm">
									{result.prompts.map((p, i) => (
										<div key={i} className="flex items-start gap-2 py-1 border-b last:border-0">
											<span className="text-muted-foreground w-6 flex-shrink-0">{i + 1}.</span>
											<span className={p.brandedPrompt ? "text-blue-600" : ""}>{p.prompt}</span>
											{p.brandedPrompt && (
												<Badge variant="secondary" className="text-xs flex-shrink-0">branded</Badge>
											)}
										</div>
									))}
								</div>
							</div>
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}

function ActivityIndicator({ added, removed }: { added: number; removed: number }) {
	if (added === 0 && removed === 0) {
		return (
			<div className="flex items-center text-muted-foreground">
				<span className="w-4 mr-1" />
				<span>0</span>
			</div>
		);
	}
	
	return (
		<div className="flex items-center gap-2">
			{added > 0 && (
				<div className="flex items-center text-green-600">
					<TrendingUp className="h-4 w-4 mr-1" />
					<span>+{added}</span>
				</div>
			)}
			{removed > 0 && (
				<div className="flex items-center text-red-600">
					<TrendingDown className="h-4 w-4 mr-1" />
					<span>-{removed}</span>
				</div>
			)}
		</div>
	);
}

export default function AdminPage() {
	const [brands, setBrands] = useState<BrandStats[]>([]);
	const [brandsOverTime, setBrandsOverTime] = useState<{ date: string; count: number }[]>([]);
	const [promptsOverTime, setPromptsOverTime] = useState<{ date: string; enabled: number; disabled: number }[]>([]);
	const [runsOverTime, setRunsOverTime] = useState<{ date: string; count: number }[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [isAuthorized, setIsAuthorized] = useState(true);
	
	const fetchBrandStats = async () => {
		try {
			const response = await fetch("/api/admin/brands/stats");
			
			if (response.status === 403) {
				setIsAuthorized(false);
				return;
			}
			
			if (!response.ok) {
				throw new Error("Failed to fetch brand statistics");
			}
			
			const data = await response.json();
			setBrands(data.brands);
			setBrandsOverTime(data.brandsOverTime || []);
			setPromptsOverTime(data.promptsOverTime || []);
			setRunsOverTime(data.runsOverTime || []);
		} catch (err) {
			setError(err instanceof Error ? err.message : "An error occurred");
		} finally {
			setLoading(false);
		}
	};
	
	useEffect(() => {
		fetchBrandStats();
	}, []);
	
	if (!isAuthorized) {
		notFound();
	}
	
	if (loading) {
		return (
			<div className="container mx-auto py-8 space-y-8">
				<div className="space-y-2">
					<Skeleton className="h-8 w-64" />
					<Skeleton className="h-4 w-96" />
				</div>
				<Card>
					<CardHeader>
						<Skeleton className="h-6 w-48" />
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							{[...Array(5)].map((_, i) => (
								<Skeleton key={i} className="h-16 w-full" />
							))}
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}
	
	if (error) {
		return (
			<div className="container mx-auto py-8">
				<Card>
					<CardHeader>
						<CardTitle className="text-destructive">Error</CardTitle>
					</CardHeader>
					<CardContent>
						<p>{error}</p>
					</CardContent>
				</Card>
			</div>
		);
	}
	
	// Calculate totals
	const totals = brands.reduce(
		(acc, brand) => ({
			totalBrands: acc.totalBrands + 1,
			totalPrompts: acc.totalPrompts + (brand.totalPrompts || 0),
			activePrompts: acc.activePrompts + (brand.activePrompts || 0),
			promptRuns7Days: acc.promptRuns7Days + (brand.promptRuns7Days || 0),
			promptRuns30Days: acc.promptRuns30Days + (brand.promptRuns30Days || 0),
			promptsAddedLast7Days: acc.promptsAddedLast7Days + (brand.promptsAddedLast7Days || 0),
			promptsRemovedLast7Days: acc.promptsRemovedLast7Days + (brand.promptsRemovedLast7Days || 0),
			promptsAddedLast30Days: acc.promptsAddedLast30Days + (brand.promptsAddedLast30Days || 0),
			promptsRemovedLast30Days: acc.promptsRemovedLast30Days + (brand.promptsRemovedLast30Days || 0),
		}),
		{
			totalBrands: 0,
			totalPrompts: 0,
			activePrompts: 0,
			promptRuns7Days: 0,
			promptRuns30Days: 0,
			promptsAddedLast7Days: 0,
			promptsRemovedLast7Days: 0,
			promptsAddedLast30Days: 0,
			promptsRemovedLast30Days: 0,
		},
	);
	
	return (
		<div className="container mx-auto py-8 space-y-8">
			<div className="flex items-center justify-between">
				<div className="space-y-2">
					<h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
					<p className="text-muted-foreground">
						Monitor and manage brands, prompts, and job scheduling
					</p>
				</div>
				<div className="flex items-center gap-2">
					<AnalyzeDomainDialog />
					<GeneratePromptsDialog />
					<Link href="/app">
						<Button variant="outline" className="cursor-pointer">
							<ArrowLeft className="h-4 w-4 mr-2" />
							Back to Brands
						</Button>
					</Link>
				</div>
			</div>
			
			{/* Summary Cards with Charts */}
			<div className="grid gap-4 md:grid-cols-3">
				<Card>
					<CardHeader>
						<CardTitle>Brands</CardTitle>
						<CardDescription>Total: {totals.totalBrands} brands</CardDescription>
					</CardHeader>
					<CardContent className="p-0 pb-4">
						<ChartContainer
							config={{
								count: {
									label: "Total Brands",
									color: "#3b82f6",
								},
							}}
							className="h-[200px] w-full px-4"
						>
							<ResponsiveContainer width="100%" height="100%">
								<AreaChart data={brandsOverTime}>
								<defs>
									<linearGradient id="fillBrands" x1="0" y1="0" x2="0" y2="1">
										<stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
										<stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1} />
									</linearGradient>
								</defs>
								<CartesianGrid strokeDasharray="3 3" vertical={false} />
								<XAxis
									dataKey="date"
									tickLine={false}
									axisLine={false}
									tickMargin={8}
									minTickGap={30}
									tickFormatter={(value) => {
										const date = new Date(value);
										return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
									}}
								/>
								<YAxis tickLine={false} axisLine={false} tickMargin={8} width={40} />
								<ChartTooltip 
									content={<ChartTooltipContent 
										labelFormatter={(value) => {
											const date = new Date(value);
											return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
										}}
									/>} 
								/>
								<Area
									type="monotone"
									dataKey="count"
									stroke="#3b82f6"
									fill="url(#fillBrands)"
									strokeWidth={2}
								/>
								</AreaChart>
							</ResponsiveContainer>
						</ChartContainer>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Prompts</CardTitle>
						<CardDescription>Active: {totals.activePrompts} | Total: {totals.totalPrompts}</CardDescription>
					</CardHeader>
					<CardContent className="p-0 pb-4">
						<ChartContainer
							config={{
								enabled: {
									label: "Enabled",
									color: "#10b981",
								},
								disabled: {
									label: "Disabled",
									color: "#ef4444",
								},
							}}
							className="h-[200px] w-full px-4"
						>
							<ResponsiveContainer width="100%" height="100%">
								<AreaChart data={promptsOverTime}>
									<defs>
										<linearGradient id="fillEnabled" x1="0" y1="0" x2="0" y2="1">
											<stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
											<stop offset="95%" stopColor="#10b981" stopOpacity={0.1} />
										</linearGradient>
										<linearGradient id="fillDisabled" x1="0" y1="0" x2="0" y2="1">
											<stop offset="5%" stopColor="#ef4444" stopOpacity={0.8} />
											<stop offset="95%" stopColor="#ef4444" stopOpacity={0.1} />
										</linearGradient>
									</defs>
									<CartesianGrid strokeDasharray="3 3" vertical={false} />
									<XAxis
										dataKey="date"
										tickLine={false}
										axisLine={false}
										tickMargin={8}
										minTickGap={30}
										tickFormatter={(value) => {
											const date = new Date(value);
											return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
										}}
									/>
									<YAxis tickLine={false} axisLine={false} tickMargin={8} width={40} />
									<ChartTooltip 
										content={(props) => {
											if (!props.active || !props.payload) return null;
											// Reverse the payload order so Enabled shows first
											const reversedPayload = [...props.payload].reverse();
											return (
												<ChartTooltipContent 
													active={props.active}
													payload={reversedPayload}
													label={props.label}
													labelFormatter={(value) => {
														const date = new Date(value);
														return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
													}}
												/>
											);
										}}
									/>
									<Area
										type="monotone"
										dataKey="disabled"
										stackId="a"
										stroke="#ef4444"
										fill="#ef4444"
										fillOpacity={0.6}
										strokeWidth={2}
									/>
									<Area
										type="monotone"
										dataKey="enabled"
										stackId="a"
										stroke="#10b981"
										fill="#10b981"
										fillOpacity={0.6}
										strokeWidth={2}
									/>
								</AreaChart>
							</ResponsiveContainer>
						</ChartContainer>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Runs</CardTitle>
						<CardDescription>7d: {totals.promptRuns7Days.toLocaleString()} | 30d: {totals.promptRuns30Days.toLocaleString()}</CardDescription>
					</CardHeader>
					<CardContent className="p-0 pb-4">
						<ChartContainer
							config={{
								count: {
									label: "Runs",
									color: "#8b5cf6",
								},
							}}
							className="h-[200px] w-full px-4"
						>
							<ResponsiveContainer width="100%" height="100%">
								<BarChart data={runsOverTime}>
								<CartesianGrid strokeDasharray="3 3" vertical={false} />
								<XAxis
									dataKey="date"
									tickLine={false}
									axisLine={false}
									tickMargin={8}
									minTickGap={30}
									tickFormatter={(value) => {
										const date = new Date(value);
										return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
									}}
								/>
								<YAxis tickLine={false} axisLine={false} tickMargin={8} width={40} />
								<ChartTooltip 
									content={<ChartTooltipContent 
										labelFormatter={(value) => {
											const date = new Date(value);
											return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
										}}
									/>} 
								/>
								<Bar
									dataKey="count"
									fill="#8b5cf6"
									radius={[4, 4, 0, 0]}
								/>
								</BarChart>
							</ResponsiveContainer>
						</ChartContainer>
					</CardContent>
				</Card>
			</div>
			
			{/* Brand Statistics Table */}
			<Card>
				<CardHeader>
					<CardTitle>Brand Statistics</CardTitle>
					<CardDescription>
						Detailed statistics and configuration for each brand
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Brand</TableHead>
									<TableHead className="text-right">Prompts</TableHead>
									<TableHead className="text-right">Prompts (7d)</TableHead>
									<TableHead className="text-right">Prompts (30d)</TableHead>
									<TableHead className="text-right">Runs (7d)</TableHead>
									<TableHead className="text-right">Runs (30d)</TableHead>
									<TableHead>Last Run</TableHead>
									<TableHead>Run Delay</TableHead>
									<TableHead>Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{brands.map((brand) => {
									const currentDelay = brand.delayOverrideMs ?? DEFAULT_DELAY_MS;
									
									// Check if last run is overdue
									const isOverdue = brand.lastPromptRunAt && brand.activePrompts > 0
										? new Date().getTime() - new Date(brand.lastPromptRunAt).getTime() > currentDelay
										: false;
									
									return (
										<TableRow key={brand.id}>
											<TableCell className="font-medium">
												<div className="space-y-1">
													<Link 
														href={`/app/${brand.id}`}
														className="hover:underline text-primary"
													>
														{brand.name}
													</Link>
													<div className="text-xs text-muted-foreground">{brand.website}</div>
												</div>
											</TableCell>
											<TableCell className="text-right">
												<div className="font-medium">{brand.activePrompts}</div>
											</TableCell>
											<TableCell>
												<div className="flex justify-end">
													<ActivityIndicator 
														added={brand.promptsAddedLast7Days || 0} 
														removed={brand.promptsRemovedLast7Days || 0} 
													/>
												</div>
											</TableCell>
											<TableCell>
												<div className="flex justify-end">
													<ActivityIndicator 
														added={brand.promptsAddedLast30Days || 0} 
														removed={brand.promptsRemovedLast30Days || 0} 
													/>
												</div>
											</TableCell>
											<TableCell className="text-right">
												{brand.promptRuns7Days?.toLocaleString() || 0}
											</TableCell>
											<TableCell className="text-right">
												{brand.promptRuns30Days?.toLocaleString() || 0}
											</TableCell>
											<TableCell>
												{brand.lastPromptRunAt ? (
													<span className={`text-sm ${isOverdue ? "text-red-600 font-semibold" : ""}`}>
														{new Date(brand.lastPromptRunAt).toLocaleDateString()}
													</span>
												) : (
													<span className="text-muted-foreground">Never</span>
												)}
											</TableCell>
											<TableCell>
												<div className="space-y-1">
													<div className="font-medium">{formatDelay(currentDelay)}</div>
													{brand.delayOverrideMs !== null ? (
														<span className="text-xs text-muted-foreground">Custom</span>
													) : (
														<span className="text-xs text-muted-foreground">Default</span>
													)}
												</div>
											</TableCell>
											<TableCell>
												<DelayOverrideDialog brand={brand} onUpdate={fetchBrandStats} />
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

