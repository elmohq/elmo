"use client";

import { useState, useCallback, memo, useEffect, useRef, useMemo } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Progress } from "@workspace/ui/components/progress";
import { Badge } from "@workspace/ui/components/badge";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Label } from "@workspace/ui/components/label";
import { Input } from "@workspace/ui/components/input";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Separator } from "@workspace/ui/components/separator";
import { TagsInput } from "@workspace/ui/components/tags-input";
import {
	Loader2,
	CheckCircle,
	Clock,
	AlertCircle,
	Play,
	ArrowLeft,
	Plus,
	X,
	ChevronDown,
	ChevronRight,
	Copy,
	Check,
} from "lucide-react";

// Step status types
type StepStatus = "pending" | "running" | "completed" | "error" | "blocked" | "cancelled";

// Step configuration
interface WizardStep {
	id: string;
	title: string;
	dependencies: string[];
	status: StepStatus;
	progress: number;
	data?: any;
	error?: string;
}

interface WizardData {
	products: string[];
	competitors: Array<{ id: string; name: string; domain: string }>;
	personaGroups: Array<{
		id: string;
		name: string;
		personas: string[];
	}>;
	keywords: Array<{ keyword: string; search_volume: number; difficulty: number; selected: boolean }>;
	customPrompts: string[];
}

// Progress tracking utility
class ProgressTracker {
	private stepProgress: Record<string, number> = {};
	private completedSteps: Set<string> = new Set();
	private intervals: Record<string, NodeJS.Timeout> = {};

	startProgress(stepId: string, updateCallback: (progress: number) => void, speedMultiplier: number = 1) {
		this.stepProgress[stepId] = 0;
		this.completedSteps.delete(stepId);

		this.intervals[stepId] = setInterval(() => {
			if (this.completedSteps.has(stepId)) return;

			const currentProgress = this.stepProgress[stepId] || 0;
			const baseIncrement = Math.random() * 0.5 + 0.3;
			const increment = baseIncrement / speedMultiplier;
			const newProgress = Math.min(95, currentProgress + increment);
			this.stepProgress[stepId] = newProgress;
			updateCallback(newProgress);
		}, 200);
	}

	completeProgress(stepId: string, updateCallback: (progress: number) => void) {
		this.completedSteps.add(stepId);
		if (this.intervals[stepId]) {
			clearInterval(this.intervals[stepId]);
			delete this.intervals[stepId];
		}
		updateCallback(100);

		setTimeout(() => {
			delete this.stepProgress[stepId];
		}, 100);
	}

	cleanup() {
		Object.values(this.intervals).forEach((interval) => clearInterval(interval));
		this.intervals = {};
		this.stepProgress = {};
		this.completedSteps.clear();
	}
}

// API call utilities
const apiCalls = {
	async analyzeWebsite(website: string) {
		const response = await fetch("/api/wizard/analyze-website", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ website }),
		});

		if (!response.ok) throw new Error("Failed to analyze website");
		return response.json();
	},

	async getKeywords(domain: string, products: string[]) {
		const response = await fetch("/api/wizard/get-keywords", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ domain, products }),
		});

		if (!response.ok) throw new Error("Failed to get keywords");
		return response.json();
	},

	async getCompetitors(products: string[], website: string) {
		const response = await fetch("/api/wizard/get-competitors", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ products, website }),
		});

		if (!response.ok) throw new Error("Failed to get competitors");
		return response.json();
	},

	async getPersonas(products: string[], website: string) {
		const response = await fetch("/api/wizard/get-personas", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ products, website }),
		});

		if (!response.ok) throw new Error("Failed to analyze personas");
		return response.json();
	},
};

// Step execution wrapper
const createStepExecutor = (
	progressTracker: ProgressTracker,
	updateStepStatus: (stepId: string, updates: Partial<WizardStep>) => void,
) => {
	return async (stepId: string, executeFn: () => Promise<any>, speedMultiplier: number = 1) => {
		progressTracker.startProgress(stepId, (progress) => updateStepStatus(stepId, { progress }), speedMultiplier);

		try {
			const result = await executeFn();
			progressTracker.completeProgress(stepId, (progress) =>
				updateStepStatus(stepId, { status: "completed", progress, data: result }),
			);
			return result;
		} catch (error) {
			progressTracker.completeProgress(stepId, () =>
				updateStepStatus(stepId, {
					status: "error",
					error: error instanceof Error ? error.message : "Unknown error",
				}),
			);
			throw error;
		}
	};
};

const EditableTagsInput = memo(
	({
		items,
		onValueChange,
		placeholder = "Add item...",
		maxItems = 5,
	}: {
		items: string[];
		onValueChange: (value: string[]) => void;
		placeholder?: string;
		maxItems?: number;
	}) => {
		return (
			<div className="space-y-2">
				<TagsInput value={items} onValueChange={onValueChange} placeholder={placeholder} maxItems={maxItems} />
				<p className="text-xs text-muted-foreground">
					<strong>
						{items.length}/{maxItems}
					</strong>{" "}
					{items.length >= maxItems ? " items added. Remove an item to add a new one." : "items entered."}
				</p>
			</div>
		);
	},
);

EditableTagsInput.displayName = "EditableTagsInput";

// Simple collapsible section component
const CollapsibleSection = memo(
	({
		title,
		count,
		badgeColor,
		subtitle,
		children,
	}: {
		title: string;
		count: number;
		badgeColor: string;
		subtitle?: string;
		children: React.ReactNode;
	}) => {
		const [isOpen, setIsOpen] = useState(false);

		return (
			<div className="border rounded-lg">
				<button
					type="button"
					onClick={() => setIsOpen(!isOpen)}
					className="flex w-full items-center justify-between p-3 text-sm font-medium hover:bg-accent/50 transition-colors"
				>
					<div className="flex items-center gap-2">
						<Badge variant="default" className={badgeColor}>
							{count}
						</Badge>
						<span>{title}</span>
						{subtitle && <span className="text-xs text-muted-foreground font-normal">({subtitle})</span>}
					</div>
					{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
				</button>
				{isOpen && <div className="border-t">{children}</div>}
			</div>
		);
	},
);

CollapsibleSection.displayName = "CollapsibleSection";

// Step status rendering utility
const getStepStatusIcon = (status: StepStatus) => {
	switch (status) {
		case "pending":
			return <Clock className="h-4 w-4 text-muted-foreground" />;
		case "running":
			return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
		case "completed":
			return <CheckCircle className="h-4 w-4 text-green-500" />;
		case "error":
			return <AlertCircle className="h-4 w-4 text-red-500" />;
		case "blocked":
			return <Clock className="h-4 w-4 text-muted-foreground" />;
		case "cancelled":
			return <X className="h-4 w-4 text-muted-foreground" />;
		default:
			return <Clock className="h-4 w-4 text-muted-foreground" />;
	}
};

// Generate a unique ID
const generateId = () => {
	if (typeof crypto !== "undefined" && crypto.randomUUID) {
		return crypto.randomUUID();
	}
	return "id-" + Math.random().toString(36).substr(2, 9) + "-" + Date.now().toString(36);
};

// Custom hook for step management
const useStepManager = (website: string | null) => {
	const [steps, setSteps] = useState<WizardStep[]>([
		{
			id: "analyze-website",
			title: "Analyze Products",
			dependencies: [],
			status: "pending",
			progress: 0,
		},
		{
			id: "get-keywords",
			title: "Find SEO Keywords",
			dependencies: ["analyze-website"],
			status: "blocked",
			progress: 0,
		},
		{
			id: "analyze-personas",
			title: "Generate Personas",
			dependencies: ["analyze-website"],
			status: "blocked",
			progress: 0,
		},
		{
			id: "get-competitors",
			title: "Discover Competitors",
			dependencies: ["analyze-website"],
			status: "blocked",
			progress: 0,
		},
	]);

	const startedSteps = useRef<Set<string>>(new Set());
	const progressTracker = useRef<ProgressTracker>(new ProgressTracker());

	const updateStepStatus = useCallback((stepId: string, updates: Partial<WizardStep>) => {
		setSteps((prev) => prev.map((step) => (step.id === stepId ? { ...step, ...updates } : step)));
	}, []);

	const executeStep = useCallback(
		async (stepId: string, dependencyData?: any) => {
			if (startedSteps.current.has(stepId)) return;

			setSteps((prev) => {
				const step = prev.find((s) => s.id === stepId);
				if (!step || step.status !== "pending") return prev;

				startedSteps.current.add(stepId);

				return prev.map((s) => (s.id === stepId ? { ...s, status: "running" as StepStatus, progress: 0 } : s));
			});

			const executor = createStepExecutor(progressTracker.current, updateStepStatus);

			try {
				switch (stepId) {
					case "analyze-website":
						if (!website) throw new Error("No website URL");
						return await executor(stepId, () => apiCalls.analyzeWebsite(website));

					case "get-keywords":
						const currentProductsForKeywords = dependencyData?.products;
						if (
							!currentProductsForKeywords ||
							!Array.isArray(currentProductsForKeywords) ||
							currentProductsForKeywords.length === 0
						) {
							throw new Error("No products data available for keyword analysis");
						}
						if (!website) throw new Error("No website URL");
						const keywordData = await executor(stepId, () =>
							apiCalls.getKeywords(website, currentProductsForKeywords),
						);
						return {
							...keywordData,
							keywords: keywordData.keywords.map((kw: any) => ({ ...kw, selected: false })),
						};

					case "get-competitors":
						const currentProducts = dependencyData?.products;
						if (!currentProducts || !Array.isArray(currentProducts) || currentProducts.length === 0) {
							throw new Error("No products data available for competitor analysis");
						}
						if (!website) throw new Error("No website URL");
						return await executor(stepId, () => apiCalls.getCompetitors(currentProducts, website), 2);

					case "analyze-personas":
						const productsForPersonas = dependencyData?.products;
						if (!productsForPersonas || !Array.isArray(productsForPersonas) || productsForPersonas.length === 0) {
							throw new Error("No products data available for persona analysis");
						}
						if (!website) throw new Error("No website URL");
						return await executor(stepId, () => apiCalls.getPersonas(productsForPersonas, website), 2);
				}
			} catch (error) {
				updateStepStatus(stepId, {
					status: "error",
					error: error instanceof Error ? error.message : "Unknown error",
				});
			}
		},
		[updateStepStatus, website],
	);

	const resetSteps = useCallback(() => {
		startedSteps.current.clear();
		progressTracker.current.cleanup();
		setSteps([
			{
				id: "analyze-website",
				title: "Analyze Products",
				dependencies: [],
				status: "pending",
				progress: 0,
			},
			{
				id: "get-keywords",
				title: "Find SEO Keywords",
				dependencies: ["analyze-website"],
				status: "blocked",
				progress: 0,
			},
			{
				id: "analyze-personas",
				title: "Generate Personas",
				dependencies: ["analyze-website"],
				status: "blocked",
				progress: 0,
			},
			{
				id: "get-competitors",
				title: "Discover Competitors",
				dependencies: ["analyze-website"],
				status: "blocked",
				progress: 0,
			},
		]);
	}, []);

	return {
		steps,
		setSteps,
		executeStep,
		resetSteps,
		updateStepStatus,
	};
};

export default function WizardTestPage() {
	const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
	const [websiteUrl, setWebsiteUrl] = useState("");
	const [currentPhase, setCurrentPhase] = useState<"input" | "processing" | "review">("input");
	const [isGenerating, setIsGenerating] = useState(false);
	const [copied, setCopied] = useState(false);
	const [wizardData, setWizardData] = useState<WizardData>({
		products: [],
		competitors: [],
		personaGroups: [],
		keywords: [],
		customPrompts: [],
	});

	const { steps, setSteps, executeStep, resetSteps } = useStepManager(websiteUrl);

	// Check admin authorization
	useEffect(() => {
		fetch("/api/admin/brands/stats")
			.then((res) => {
				setIsAuthorized(res.status !== 403);
			})
			.catch(() => {
				setIsAuthorized(false);
			});
	}, []);

	// Calculate prompts preview
	const promptsPreview = useMemo(() => {
		// Product prompts: "best [product]"
		const productPrompts = wizardData.products.map((product) => `best ${product}`);

		// Product × Persona prompts
		const productPersonaPrompts: Array<{ prompt: string; group: string; product: string }> = [];
		for (const product of wizardData.products) {
			for (const group of wizardData.personaGroups) {
				for (const persona of group.personas) {
					productPersonaPrompts.push({
						prompt: `best ${product} for ${persona}`,
						group: group.name || "Unnamed Group",
						product,
					});
				}
			}
		}

		// Selected keywords
		const selectedKeywords = wizardData.keywords.filter((kw) => kw.selected).map((kw) => kw.keyword);

		// Custom prompts
		const customPrompts = wizardData.customPrompts;

		// Calculate totals
		const newPromptsCount =
			productPrompts.length + productPersonaPrompts.length + selectedKeywords.length + customPrompts.length;

		return {
			productPrompts,
			productPersonaPrompts,
			selectedKeywords,
			customPrompts,
			newPromptsCount,
		};
	}, [wizardData]);

	// Callbacks for updating wizard data
	const updatePersonaGroupName = useCallback((groupId: string, name: string) => {
		setWizardData((prev) => ({
			...prev,
			personaGroups: prev.personaGroups.map((g) => (g.id === groupId ? { ...g, name } : g)),
		}));
	}, []);

	const updatePersonaGroupPersonas = useCallback((groupId: string, personas: string[]) => {
		setWizardData((prev) => ({
			...prev,
			personaGroups: prev.personaGroups.map((g) => (g.id === groupId ? { ...g, personas } : g)),
		}));
	}, []);

	const removePersonaGroup = useCallback((groupId: string) => {
		setWizardData((prev) => ({
			...prev,
			personaGroups: prev.personaGroups.filter((g) => g.id !== groupId),
		}));
	}, []);

	const addPersonaGroup = useCallback(() => {
		setWizardData((prev) => ({
			...prev,
			personaGroups: [...prev.personaGroups, { id: generateId(), name: "", personas: [] }],
		}));
	}, []);

	const updateCompetitorName = useCallback((competitorId: string, name: string) => {
		setWizardData((prev) => ({
			...prev,
			competitors: prev.competitors.map((c) => (c.id === competitorId ? { ...c, name } : c)),
		}));
	}, []);

	const updateCompetitorDomain = useCallback((competitorId: string, domain: string) => {
		setWizardData((prev) => ({
			...prev,
			competitors: prev.competitors.map((c) => (c.id === competitorId ? { ...c, domain } : c)),
		}));
	}, []);

	const removeCompetitor = useCallback((competitorId: string) => {
		setWizardData((prev) => ({
			...prev,
			competitors: prev.competitors.filter((c) => c.id !== competitorId),
		}));
	}, []);

	const addCompetitor = useCallback(() => {
		setWizardData((prev) => ({
			...prev,
			competitors: [...prev.competitors, { id: generateId(), name: "", domain: "" }],
		}));
	}, []);

	const updateKeywordSelection = useCallback((keyword: string, selected: boolean) => {
		setWizardData((prev) => ({
			...prev,
			keywords: prev.keywords.map((kw) => (kw.keyword === keyword ? { ...kw, selected } : kw)),
		}));
	}, []);

	const updateAllKeywordSelection = useCallback((selected: boolean, limit?: number) => {
		setWizardData((prev) => ({
			...prev,
			keywords: prev.keywords.map((kw, i) => ({
				...kw,
				selected: limit ? selected && i < limit : selected,
			})),
		}));
	}, []);

	const updateProducts = useCallback((products: string[]) => {
		setWizardData((prev) => ({ ...prev, products }));
	}, []);

	const updateCustomPrompts = useCallback((customPrompts: string[]) => {
		setWizardData((prev) => ({ ...prev, customPrompts }));
	}, []);

	// Start processing
	const startProcessing = async () => {
		if (!websiteUrl.trim()) return;

		setIsGenerating(true);
		resetSteps();
		setCurrentPhase("processing");

		const independentSteps = steps.filter((step) => step.dependencies.length === 0);
		for (const step of independentSteps) {
			executeStep(step.id);
		}
	};

	// Reset wizard
	const resetWizard = () => {
		setCurrentPhase("input");
		setIsGenerating(false);
		resetSteps();
		setWizardData({
			products: [],
			competitors: [],
			personaGroups: [],
			keywords: [],
			customPrompts: [],
		});
	};

	// Monitor for dependency completion and start next steps
	useEffect(() => {
		if (currentPhase !== "processing") return;

		const analyzeStep = steps.find((step) => step.id === "analyze-website");
		if (analyzeStep?.status === "completed" && analyzeStep.data?.skipDetailedAnalysis) {
			setSteps((prev) => {
				return prev.map((step) => {
					if (step.id !== "analyze-website" && step.status !== "completed") {
						return { ...step, status: "cancelled" as StepStatus };
					}
					return step;
				});
			});

			const newWizardData = {
				products: analyzeStep.data.products || [],
				competitors: [],
				personaGroups: [],
				keywords: [],
				customPrompts: [],
			};
			setWizardData(newWizardData);
			setCurrentPhase("review");
			return;
		}

		setSteps((prev) => {
			let hasChanges = false;
			const updated = prev.map((step) => {
				if (step.status === "blocked") {
					const depsCompleted = step.dependencies.every((depId) => {
						const depStep = prev.find((s) => s.id === depId);
						return depStep?.status === "completed";
					});
					if (depsCompleted) {
						hasChanges = true;
						return { ...step, status: "pending" as StepStatus };
					}
				}
				return step;
			});
			return hasChanges ? updated : prev;
		});
	}, [steps, currentPhase, setSteps]);

	// Execute pending steps
	useEffect(() => {
		if (currentPhase !== "processing") return;

		const pendingSteps = steps.filter((step) => step.status === "pending");

		for (const step of pendingSteps) {
			const dependencyData = step.dependencies.reduce((acc, depId) => {
				const depStep = steps.find((s) => s.id === depId);
				if (depStep?.data) {
					if (depId === "analyze-website") {
						acc.products = depStep.data.products;
					}
				}
				return acc;
			}, {} as any);

			executeStep(step.id, dependencyData);
		}
	}, [steps, currentPhase, executeStep]);

	// Check if all steps completed
	useEffect(() => {
		const allCompleted = steps.every((step) => step.status === "completed");
		if (allCompleted && currentPhase === "processing") {
			const newWizardData = { ...wizardData };

			steps.forEach((step) => {
				if (step.data) {
					switch (step.id) {
						case "analyze-website":
							newWizardData.products = step.data.products;
							break;
						case "get-keywords":
							newWizardData.keywords = step.data.keywords;
							break;
						case "get-competitors":
							newWizardData.competitors = step.data.competitors.map((competitor: any) => ({
								...competitor,
								id: generateId(),
							}));
							break;
						case "analyze-personas":
							newWizardData.personaGroups = step.data.personaGroups.map((group: any) => ({
								...group,
								id: generateId(),
							}));
							break;
					}
				}
			});

			setWizardData(newWizardData);
			setCurrentPhase("review");
		}
	}, [steps, currentPhase, wizardData]);

	// Copy results to clipboard
	const handleCopyResults = async () => {
		const allPrompts = [
			...promptsPreview.productPrompts,
			...promptsPreview.productPersonaPrompts.map((p) => p.prompt),
			...promptsPreview.selectedKeywords,
			...promptsPreview.customPrompts,
		];

		const output = {
			website: websiteUrl,
			products: wizardData.products,
			competitors: wizardData.competitors.map((c) => ({ name: c.name, domain: c.domain })),
			personaGroups: wizardData.personaGroups.map((g) => ({ name: g.name, personas: g.personas })),
			keywords: wizardData.keywords.filter((k) => k.selected),
			customPrompts: wizardData.customPrompts,
			generatedPrompts: allPrompts,
		};

		await navigator.clipboard.writeText(JSON.stringify(output, null, 2));
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	if (isAuthorized === null) {
		return (
			<div className="container mx-auto py-8 space-y-8">
				<Skeleton className="h-8 w-64" />
				<Skeleton className="h-4 w-96" />
				<Skeleton className="h-64 w-full" />
			</div>
		);
	}

	if (!isAuthorized) {
		notFound();
	}

	return (
		<div className="container mx-auto py-8 px-6 space-y-8">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="space-y-2">
					<h1 className="text-3xl font-bold tracking-tight">Wizard Test</h1>
					<p className="text-muted-foreground">
						Test the onboarding wizard independently without creating a brand
					</p>
				</div>
				<Link href="/admin">
					<Button variant="outline" className="cursor-pointer">
						<ArrowLeft className="h-4 w-4 mr-2" />
						Back to Admin
					</Button>
				</Link>
			</div>

			{/* Input Phase */}
			{currentPhase === "input" && (
				<Card>
					<CardHeader>
						<CardTitle>Enter Website URL</CardTitle>
						<CardDescription>
							Enter a website URL to test the wizard analysis steps
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="website">Website URL</Label>
							<Input
								id="website"
								placeholder="https://example.com"
								value={websiteUrl}
								onChange={(e) => setWebsiteUrl(e.target.value)}
								onKeyDown={(e) => e.key === "Enter" && websiteUrl.trim() && startProcessing()}
							/>
						</div>

						<div className="space-y-4 pt-4">
							<p className="text-sm text-muted-foreground font-medium">Steps that will run:</p>
							{steps.map((step) => (
								<div key={step.id} className="flex items-center gap-4">
									<div className="flex items-center gap-3 flex-1">
										{getStepStatusIcon(step.status)}
										<span className="text-sm font-medium">{step.title}</span>
									</div>
									<div className="flex-1">
										<Progress value={0} className="h-2 bg-muted/60 [&>*]:bg-muted-foreground/60" />
									</div>
								</div>
							))}
						</div>

						<Button
							onClick={startProcessing}
							disabled={!websiteUrl.trim() || isGenerating}
							className="flex items-center gap-2 cursor-pointer"
						>
							{isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
							Start Analysis
						</Button>
					</CardContent>
				</Card>
			)}

			{/* Processing Phase */}
			{currentPhase === "processing" && (
				<Card>
					<CardHeader>
						<CardTitle>Analyzing {websiteUrl}</CardTitle>
						<CardDescription>Running wizard steps...</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						{steps.map((step) => (
							<div key={step.id} className="flex items-center gap-4">
								<div className="flex items-center gap-3 flex-1">
									{getStepStatusIcon(step.status)}
									<span className="text-sm font-medium">{step.title}</span>
								</div>
								<div className="flex-1">
									{(step.status === "running" || step.status === "completed" || step.status === "blocked") && (
										<Progress value={step.progress} className="h-2 bg-muted/60 [&>*]:bg-muted-foreground/60" />
									)}
									{step.status === "error" && step.error && (
										<div className="text-xs text-red-600 bg-red-50 p-2 rounded">{step.error}</div>
									)}
								</div>
							</div>
						))}

						<Button disabled className="flex items-center gap-2">
							<Loader2 className="h-4 w-4 animate-spin" />
							Processing...
						</Button>
					</CardContent>
				</Card>
			)}

			{/* Review Phase */}
			{currentPhase === "review" && (
				<div className="space-y-6">
					{/* Steps Status */}
					<Card>
						<CardHeader>
							<CardTitle>Analysis Complete</CardTitle>
							<CardDescription>
								Analyzed {websiteUrl}
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							{steps.map((step) => (
								<div key={step.id} className="flex items-center gap-4">
									<div className="flex items-center gap-3 flex-1">
										{getStepStatusIcon(step.status)}
										<span className="text-sm font-medium">{step.title}</span>
									</div>
									<div className="flex-1">
										<Progress value={step.progress} className="h-2 bg-muted/60 [&>*]:bg-muted-foreground/60" />
									</div>
								</div>
							))}
						</CardContent>
					</Card>

					{/* Products Section */}
					<div className="space-y-2">
						<h2 className="text-2xl font-bold">Review Product Categories</h2>
						<p className="text-muted-foreground">What are the main types of products you sell?</p>
						<EditableTagsInput items={wizardData.products} onValueChange={updateProducts} placeholder="Add product..." />
					</div>

					<Separator />

					{/* Competitors Section */}
					<div className="space-y-2">
						<h2 className="text-2xl font-bold">Review Competitors</h2>
						<p className="text-muted-foreground">Who are your primary competitors?</p>
						<div className="space-y-4">
							{wizardData.competitors.map((competitor) => (
								<div key={competitor.id} className="flex gap-2 items-center p-3 border rounded-lg">
									<Input
										type="text"
										value={competitor.name}
										onChange={(e) => updateCompetitorName(competitor.id, e.target.value)}
										placeholder="Competitor name"
										className="flex-1"
									/>
									<Input
										type="text"
										value={competitor.domain}
										onChange={(e) => updateCompetitorDomain(competitor.id, e.target.value)}
										placeholder="domain.com"
										className="flex-1"
									/>
									<Button variant="outline" size="sm" onClick={() => removeCompetitor(competitor.id)} className="p-2">
										<X className="h-4 w-4" />
									</Button>
								</div>
							))}
							<Button variant="outline" size="sm" onClick={addCompetitor} className="flex items-center gap-2">
								<Plus className="h-4 w-4" /> Add Competitor
							</Button>
						</div>
					</div>

					<Separator />

					{/* Persona Groups Section */}
					<div className="space-y-2">
						<h2 className="text-2xl font-bold">Review Targeting Groups</h2>
						<p className="text-muted-foreground">Review categories of people or use cases you want to track.</p>
						<div className="space-y-4">
							{wizardData.personaGroups.map((group) => (
								<div key={group.id} className="space-y-3 p-4 border rounded-lg">
									<div className="flex items-center gap-2">
										<Input
											type="text"
											value={group.name}
											onChange={(e) => updatePersonaGroupName(group.id, e.target.value)}
											placeholder="Group name"
											className="flex-1 cursor-pointer"
										/>
										<Button
											variant="outline"
											size="sm"
											onClick={() => removePersonaGroup(group.id)}
											className="p-2 cursor-pointer"
										>
											<X className="h-4 w-4" />
										</Button>
									</div>
									<EditableTagsInput
										items={group.personas}
										onValueChange={(personas) => updatePersonaGroupPersonas(group.id, personas)}
										placeholder="Add item..."
										maxItems={4}
									/>
								</div>
							))}
							{wizardData.personaGroups.length < 3 && (
								<Button
									variant="outline"
									size="sm"
									onClick={addPersonaGroup}
									className="flex items-center gap-2 cursor-pointer"
								>
									<Plus className="h-4 w-4" /> Add Group
								</Button>
							)}
						</div>
					</div>

					<Separator />

					{/* Keywords Section */}
					{wizardData.keywords.length > 0 && (
						<>
							<div className="space-y-2">
								<h2 className="text-2xl font-bold">Review SEO Keywords</h2>
								<p className="text-muted-foreground">What are some relevant SEO keywords for your brand?</p>
							</div>
							<div className="space-y-4">
								<div className="flex gap-2">
									<Button
										variant="outline"
										size="sm"
										onClick={() => updateAllKeywordSelection(true, 30)}
										className="cursor-pointer"
									>
										Select All
									</Button>
									<Button
										variant="outline"
										size="sm"
										onClick={() => updateAllKeywordSelection(false)}
										className="cursor-pointer"
									>
										Clear All
									</Button>
								</div>
								<div className="space-y-2 max-h-80 overflow-y-auto">
									{wizardData.keywords.map((kw) => (
										<Label
											key={kw.keyword}
											className="hover:bg-accent/50 flex items-center gap-3 rounded-lg border p-3 has-[[aria-checked=true]]:border-blue-600 has-[[aria-checked=true]]:bg-blue-50 dark:has-[[aria-checked=true]]:border-blue-900 dark:has-[[aria-checked=true]]:bg-blue-950 cursor-pointer"
										>
											<Checkbox
												id={`keyword-${kw.keyword.replace(/\s+/g, "-")}`}
												checked={kw.selected}
												onCheckedChange={(checked) => updateKeywordSelection(kw.keyword, checked === true)}
												className="data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600 data-[state=checked]:text-white dark:data-[state=checked]:border-blue-700 dark:data-[state=checked]:bg-blue-700"
											/>
											<div className="flex-1 font-normal">
												<p className="text-sm leading-none font-medium flex justify-between">
													{kw.keyword}
													<span className="text-muted-foreground ml-2 font-normal">
														{new Intl.NumberFormat("en-US", { notation: "compact" }).format(kw.search_volume)}/month (
														{kw.difficulty < 30 ? "easy" : kw.difficulty > 70 ? "hard" : "medium"})
													</span>
												</p>
											</div>
										</Label>
									))}
								</div>
							</div>
							<Separator />
						</>
					)}

					{/* Custom Prompts Section */}
					<div className="space-y-2">
						<h2 className="text-2xl font-bold">Add Custom Prompts</h2>
						<p className="text-muted-foreground">Add any additional prompts you want to track for your brand.</p>
						<EditableTagsInput
							items={wizardData.customPrompts}
							onValueChange={updateCustomPrompts}
							placeholder="Add custom prompt..."
							maxItems={10}
						/>
					</div>

					<Separator />

					{/* Prompts Preview Section */}
					<div className="space-y-4">
						<div className="space-y-2">
							<h2 className="text-2xl font-bold">Prompts Preview</h2>
							<p className="text-muted-foreground">
								These prompts would be created ({promptsPreview.newPromptsCount} total)
							</p>
						</div>

						{/* Breakdown */}
						<div className="space-y-2">
							{promptsPreview.productPrompts.length > 0 && (
								<CollapsibleSection
									title="Product Prompts"
									count={promptsPreview.productPrompts.length}
									badgeColor="bg-blue-500"
									subtitle="from product categories"
								>
									<div className="bg-muted/30 p-3">
										<div className="space-y-1">
											{promptsPreview.productPrompts.map((prompt, i) => (
												<div key={i} className="text-xs">
													{prompt}
												</div>
											))}
										</div>
									</div>
								</CollapsibleSection>
							)}

							{promptsPreview.productPersonaPrompts.length > 0 && (
								<CollapsibleSection
									title="Product × Targeting Prompts"
									count={promptsPreview.productPersonaPrompts.length}
									badgeColor="bg-purple-500"
									subtitle="products × targeting groups"
								>
									<div className="max-h-64 overflow-y-auto bg-muted/30 p-3">
										<div className="space-y-1">
											{promptsPreview.productPersonaPrompts.map((item, i) => (
												<div key={i} className="text-xs flex items-center gap-2">
													<span>{item.prompt}</span>
													<Badge variant="outline" className="text-[10px] px-1 py-0">
														{item.group}
													</Badge>
												</div>
											))}
										</div>
									</div>
								</CollapsibleSection>
							)}

							{promptsPreview.selectedKeywords.length > 0 && (
								<CollapsibleSection
									title="SEO Keyword Prompts"
									count={promptsPreview.selectedKeywords.length}
									badgeColor="bg-green-500"
									subtitle="selected keywords"
								>
									<div className="bg-muted/30 p-3">
										<div className="space-y-1">
											{promptsPreview.selectedKeywords.map((keyword, i) => (
												<div key={i} className="text-xs">
													{keyword}
												</div>
											))}
										</div>
									</div>
								</CollapsibleSection>
							)}

							{promptsPreview.customPrompts.length > 0 && (
								<CollapsibleSection
									title="Custom Prompts"
									count={promptsPreview.customPrompts.length}
									badgeColor="bg-orange-500"
								>
									<div className="bg-muted/30 p-3">
										<div className="space-y-1">
											{promptsPreview.customPrompts.map((prompt, i) => (
												<div key={i} className="text-xs">
													{prompt}
												</div>
											))}
										</div>
									</div>
								</CollapsibleSection>
							)}

							{promptsPreview.newPromptsCount === 0 && (
								<div className="text-sm text-muted-foreground text-center py-4 border rounded-lg">
									No prompts to preview. Add products, targeting groups, keywords, or custom prompts above.
								</div>
							)}
						</div>
					</div>

					<Separator />

					{/* Actions */}
					<div className="flex gap-4">
						<Button
							onClick={handleCopyResults}
							variant="outline"
							className="flex items-center gap-2 cursor-pointer"
						>
							{copied ? (
								<>
									<Check className="h-4 w-4" />
									Copied!
								</>
							) : (
								<>
									<Copy className="h-4 w-4" />
									Copy Results as JSON
								</>
							)}
						</Button>
						<Button
							onClick={resetWizard}
							variant="outline"
							className="flex items-center gap-2 cursor-pointer"
						>
							<ArrowLeft className="h-4 w-4" />
							Start Over
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
