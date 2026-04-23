/**
 * /admin/tools - Admin utilities for domain analysis and prompt generation
 */
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { getAppName } from "@/lib/route-head";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Badge } from "@workspace/ui/components/badge";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@workspace/ui/components/dialog";
import { Search, Sparkles, Loader2, Copy, Check } from "lucide-react";
import { adminAnalyzeDomainFn, adminGeneratePromptsFn } from "@/server/admin";

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
			const data = await adminAnalyzeDomainFn({ data: { website: website.trim() } });
			setResult(data as AnalyzeDomainResult);
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
		<Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : handleClose())}>
			<DialogTrigger asChild>
				<Button variant="outline" className="cursor-pointer w-full">
					<Search className="h-4 w-4 mr-2" />
					Analyze Domain
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Analyze Domain</DialogTitle>
					<DialogDescription>Get products and competitors for a website domain.</DialogDescription>
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

					{error && <p className="text-sm text-destructive">{error}</p>}

					{result && (
						<div className="space-y-4">
							<div className="flex items-center justify-between">
								<h4 className="font-semibold">Results</h4>
								<Button variant="ghost" size="sm" onClick={handleCopy} className="cursor-pointer">
									{copied ? (
										<>
											<Check className="h-4 w-4 mr-1" /> Copied
										</>
									) : (
										<>
											<Copy className="h-4 w-4 mr-1" /> Copy JSON
										</>
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
										{result.products.map((product) => (
											<Badge key={product} variant="secondary">
												{product}
											</Badge>
										))}
									</div>
								</div>

								<div>
									<Label className="text-muted-foreground">Competitors ({result.competitors.length})</Label>
									<div className="mt-1 space-y-1">
										{result.competitors.length === 0 ? (
											<p className="text-muted-foreground">No competitors found</p>
										) : (
											result.competitors.map((c) => (
												<div key={c.domain} className="flex items-center gap-2">
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
			const data = await adminGeneratePromptsFn({
				data: {
					website: website.trim(),
					brandName: brandName.trim() || undefined,
				},
			});
			setResult(data as GeneratePromptsResult);
		} catch (err) {
			setError(err instanceof Error ? err.message : "An error occurred");
		} finally {
			setIsLoading(false);
		}
	};

	const handleCopyPrompts = async () => {
		if (!result) return;
		const text = result.prompts.map((p) => p.prompt).join("\n");
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

	const brandedCount = result?.prompts.filter((p) => p.brandedPrompt).length ?? 0;
	const unbrandedCount = result?.prompts.filter((p) => !p.brandedPrompt).length ?? 0;

	return (
		<Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : handleClose())}>
			<DialogTrigger asChild>
				<Button variant="outline" className="cursor-pointer w-full">
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

					{error && <p className="text-sm text-destructive">{error}</p>}

					{result && (
						<div className="space-y-4">
							<div className="flex items-center justify-between">
								<h4 className="font-semibold">
									Generated {result.prompts.length} prompts for {result.brandName}
								</h4>
								<div className="flex gap-2">
									<Button variant="ghost" size="sm" onClick={handleCopyPrompts} className="cursor-pointer">
										{copied ? (
											<>
												<Check className="h-4 w-4 mr-1" /> Copied
											</>
										) : (
											<>
												<Copy className="h-4 w-4 mr-1" /> Copy Prompts
											</>
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
									<p className="font-medium">{unbrandedCount.toLocaleString()}</p>
								</div>
								<div>
									<Label className="text-muted-foreground">Branded Prompts</Label>
									<p className="font-medium">{brandedCount.toLocaleString()}</p>
								</div>
							</div>

							<div className="space-y-2">
								<Label className="text-muted-foreground">Products</Label>
								<div className="flex flex-wrap gap-1">
									{result.products.map((product) => (
										<Badge key={product} variant="secondary">
											{product}
										</Badge>
									))}
								</div>
							</div>

							<div className="space-y-2">
								<Label className="text-muted-foreground">Competitors</Label>
								<div className="flex flex-wrap gap-1">
									{result.competitors.map((c) => (
										<Badge key={c.name} variant="outline">
											{c.name}
										</Badge>
									))}
								</div>
							</div>

							<div className="space-y-2">
								<Label className="text-muted-foreground">Prompts</Label>
								<div className="max-h-60 overflow-y-auto border rounded-md p-2 space-y-1 text-sm">
								{result.prompts.map((p, i) => (
									<div key={p.prompt} className="flex items-start gap-2 py-1 border-b last:border-0">
										<span className="text-muted-foreground w-6 flex-shrink-0">{i + 1}.</span>
											<span className={p.brandedPrompt ? "text-blue-600" : ""}>{p.prompt}</span>
											{p.brandedPrompt && (
												<Badge variant="secondary" className="text-xs flex-shrink-0">
													branded
												</Badge>
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

export const Route = createFileRoute("/_authed/admin/tools")({
	head: ({ match }) => {
		const appName = getAppName(match);
		return {
			meta: [
				{ title: `Tools · ${appName}` },
				{ name: "description", content: "Domain analysis and prompt generation utilities." },
			],
		};
	},
	component: ToolsPage,
});

function ToolsPage() {
	return (
		<div className="space-y-8">
			<div className="space-y-2">
				<h1 className="text-3xl font-bold tracking-tight">Tools</h1>
				<p className="text-muted-foreground">
					Admin utilities for analyzing domains and generating prompt suggestions.
				</p>
			</div>

			<div className="grid gap-6 md:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Search className="h-5 w-5" />
							Analyze Domain
						</CardTitle>
						<CardDescription>
							Enter any website URL to discover its products, estimate domain traffic, and identify competitors.
							This is the same analysis used during brand onboarding to understand a business's competitive
							landscape.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<AnalyzeDomainDialog />
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Sparkles className="h-5 w-5" />
							Generate Prompts
						</CardTitle>
						<CardDescription>
							Automatically generate AI tracking prompts for any brand based on its website analysis. This runs
							the full pipeline: analyze the domain, find competitors, and generate both branded and unbranded
							prompts that can be used to track AI visibility.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<GeneratePromptsDialog />
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
