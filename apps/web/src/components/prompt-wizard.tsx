
import { useState, useCallback, memo, useEffect, useRef, useMemo } from "react";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Progress } from "@workspace/ui/components/progress";
import { Badge } from "@workspace/ui/components/badge";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Label } from "@workspace/ui/components/label";
import { Input } from "@workspace/ui/components/input";
import { Loader2, CheckCircle, Clock, AlertCircle, Play, Pause, Rocket, Plus, X, ChevronDown, ChevronRight } from "lucide-react";
import { useBrand } from "@/hooks/use-brands";
import { TagsInput } from "@workspace/ui/components/tags-input";
import { Separator } from "@workspace/ui/components/separator";
import { MAX_COMPETITORS } from "@workspace/lib/constants";
import {
	analyzeWebsiteFn,
	getKeywordsFn,
	getCompetitorsFn,
	getPersonasFn,
	createPromptsFn,
} from "@/server/wizard";

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

interface PromptWizardProps {
	onComplete: () => void;
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

		// Clean up progress tracking after a short delay
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

// Server function wrappers
const apiCalls = {
	async analyzeWebsite(website: string) {
		return analyzeWebsiteFn({ data: { website } });
	},

	async getKeywords(domain: string, products: string[]) {
		return getKeywordsFn({ data: { domain, products } });
	},

	async getCompetitors(products: string[], website: string) {
		return getCompetitorsFn({ data: { products, website } });
	},

	async getPersonas(products: string[], website: string) {
		return getPersonasFn({ data: { products, website } });
	},

	async createPrompts(
		brandId: string,
		data: {
			products: string[];
			competitors: Array<{ name: string; domain: string }>;
			personaGroups: Array<{ name: string; personas: string[] }>;
			keywords: Array<{ keyword: string; search_volume: number; difficulty: number; selected: boolean }>;
			customPrompts: string[];
		},
	): Promise<{ success: boolean; error?: string }> {
		try {
			const selectedKeywords = data.keywords.filter((kw) => kw.selected).map((kw) => kw.keyword);
			await createPromptsFn({
				data: {
					brandId,
					products: data.products,
					competitors: data.competitors.map((c) => ({ name: c.name, domain: c.domain })),
					personaGroups: data.personaGroups.map((g) => ({
						name: g.name,
						personas: g.personas.map((p) => ({ name: p })),
					})),
					keywords: selectedKeywords,
					customPrompts: data.customPrompts,
				},
			});
			return { success: true };
		} catch (error) {
			return { success: false, error: error instanceof Error ? error.message : "Failed to create prompts" };
		}
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

// Custom hook for step management
const useStepManager = (brand: any) => {
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
			// Check if step has already been started
			if (startedSteps.current.has(stepId)) return;

			// Add guard to prevent multiple executions
			setSteps((prev) => {
				const step = prev.find((s) => s.id === stepId);
				if (!step || step.status !== "pending") return prev;

				// Mark this step as started
				startedSteps.current.add(stepId);

				// Mark as running immediately
				return prev.map((s) => (s.id === stepId ? { ...s, status: "running" as StepStatus, progress: 0 } : s));
			});

			const executor = createStepExecutor(progressTracker.current, updateStepStatus);

			try {
				switch (stepId) {
					case "analyze-website":
						if (!brand?.website) throw new Error("No website URL");
						return await executor(stepId, () => apiCalls.analyzeWebsite(brand.website));

					case "get-keywords":
						const currentProductsForKeywords = dependencyData?.products;
						if (
							!currentProductsForKeywords ||
							!Array.isArray(currentProductsForKeywords) ||
							currentProductsForKeywords.length === 0
						) {
							throw new Error("No products data available for keyword analysis");
						}
						if (!brand?.website) throw new Error("No website URL");
						const keywordData = await executor(stepId, () =>
							apiCalls.getKeywords(brand.website, currentProductsForKeywords),
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
						if (!brand?.website) throw new Error("No website URL");
						return await executor(stepId, () => apiCalls.getCompetitors(currentProducts, brand.website), 2); // 2x slower

					case "analyze-personas":
						const productsForPersonas = dependencyData?.products;
						if (!productsForPersonas || !Array.isArray(productsForPersonas) || productsForPersonas.length === 0) {
							throw new Error("No products data available for persona analysis");
						}
						if (!brand?.website) throw new Error("No website URL");
						return await executor(stepId, () => apiCalls.getPersonas(productsForPersonas, brand.website), 2); // 2x slower
				}
			} catch (error) {
				updateStepStatus(stepId, {
					status: "error",
					error: error instanceof Error ? error.message : "Unknown error",
				});
			}
		},
		[updateStepStatus, brand],
	);

	const resetSteps = useCallback(() => {
		startedSteps.current.clear();
		progressTracker.current.cleanup();
	}, []);

	return {
		steps,
		setSteps,
		executeStep,
		resetSteps,
		updateStepStatus,
	};
};

// Generate a unique ID that works across all browsers
const generateId = () => {
	// Use crypto.randomUUID() if available, otherwise fallback to a custom implementation
	if (typeof crypto !== "undefined" && crypto.randomUUID) {
		return crypto.randomUUID();
	}
	// Fallback for browsers that don't support crypto.randomUUID()
	return "id-" + Math.random().toString(36).substr(2, 9) + "-" + Date.now().toString(36);
};

export default function PromptWizard({ onComplete }: PromptWizardProps) {
	const { brand, revalidate } = useBrand();
	const [currentPhase, setCurrentPhase] = useState<"idle" | "processing" | "review" | "complete">("idle");
	const [isGenerating, setIsGenerating] = useState(false);
	const [isCreatingPrompts, setIsCreatingPrompts] = useState(false);
	const [createPromptsError, setCreatePromptsError] = useState<string | null>(null);
	const [wizardData, setWizardData] = useState<WizardData>({
		products: [],
		competitors: [],
		personaGroups: [],
		keywords: [],
		customPrompts: [],
	});

	const { steps, setSteps, executeStep, resetSteps } = useStepManager(brand);

	// Calculate prompts preview
	const promptsPreview = useMemo(() => {
		const existingPrompts = brand?.prompts || [];
		const existingCount = existingPrompts.length;

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
		const totalAfterCreation = existingCount + newPromptsCount;

		return {
			existingPrompts,
			existingCount,
			productPrompts,
			productPersonaPrompts,
			selectedKeywords,
			customPrompts,
			newPromptsCount,
			totalAfterCreation,
		};
	}, [brand?.prompts, wizardData]);

	// Memoized callback for updating persona group names
	const updatePersonaGroupName = useCallback((groupId: string, name: string) => {
		setWizardData((prev) => ({
			...prev,
			personaGroups: prev.personaGroups.map((g) => (g.id === groupId ? { ...g, name } : g)),
		}));
	}, []);

	// Memoized callback for updating persona group personas
	const updatePersonaGroupPersonas = useCallback((groupId: string, personas: string[]) => {
		setWizardData((prev) => ({
			...prev,
			personaGroups: prev.personaGroups.map((g) => (g.id === groupId ? { ...g, personas } : g)),
		}));
	}, []);

	// Memoized callback for removing persona groups
	const removePersonaGroup = useCallback((groupId: string) => {
		setWizardData((prev) => ({
			...prev,
			personaGroups: prev.personaGroups.filter((g) => g.id !== groupId),
		}));
	}, []);

	// Memoized callback for adding persona groups
	const addPersonaGroup = useCallback(() => {
		setWizardData((prev) => ({
			...prev,
			personaGroups: [...prev.personaGroups, { id: generateId(), name: "", personas: [] }],
		}));
	}, []);

	// Memoized callback for updating competitor names
	const updateCompetitorName = useCallback((competitorId: string, name: string) => {
		setWizardData((prev) => ({
			...prev,
			competitors: prev.competitors.map((c) => (c.id === competitorId ? { ...c, name } : c)),
		}));
	}, []);

	// Memoized callback for updating competitor domains
	const updateCompetitorDomain = useCallback((competitorId: string, domain: string) => {
		setWizardData((prev) => ({
			...prev,
			competitors: prev.competitors.map((c) => (c.id === competitorId ? { ...c, domain } : c)),
		}));
	}, []);

	// Memoized callback for removing competitors
	const removeCompetitor = useCallback((competitorId: string) => {
		setWizardData((prev) => ({
			...prev,
			competitors: prev.competitors.filter((c) => c.id !== competitorId),
		}));
	}, []);

	// Memoized callback for adding competitors
	const addCompetitor = useCallback(() => {
		setWizardData((prev) => ({
			...prev,
			competitors: [...prev.competitors, { id: generateId(), name: "", domain: "" }],
		}));
	}, []);

	// Memoized callback for updating keyword selection
	const updateKeywordSelection = useCallback((keyword: string, selected: boolean) => {
		setWizardData((prev) => ({
			...prev,
			keywords: prev.keywords.map((kw) => (kw.keyword === keyword ? { ...kw, selected } : kw)),
		}));
	}, []);

	// Memoized callback for updating all keyword selection
	const updateAllKeywordSelection = useCallback((selected: boolean, limit?: number) => {
		setWizardData((prev) => ({
			...prev,
			keywords: prev.keywords.map((kw, i) => ({
				...kw,
				selected: limit ? selected && i < limit : selected,
			})),
		}));
	}, []);

	// Memoized callback for updating products
	const updateProducts = useCallback((products: string[]) => {
		setWizardData((prev) => ({ ...prev, products }));
	}, []);

	// Memoized callback for updating custom prompts
	const updateCustomPrompts = useCallback((customPrompts: string[]) => {
		setWizardData((prev) => ({ ...prev, customPrompts }));
	}, []);

	// Start all parallel processing
	const startProcessing = async () => {
		setIsGenerating(true);
		resetSteps();
		setCurrentPhase("processing");

		// Start independent steps immediately
		const independentSteps = steps.filter((step) => step.dependencies.length === 0);
		for (const step of independentSteps) {
			executeStep(step.id);
		}
	};

	// Monitor for dependency completion and start next steps
	useEffect(() => {
		if (currentPhase !== "processing") return;

		// Check if analyze-website is completed and has skipDetailedAnalysis flag
		const analyzeStep = steps.find((step) => step.id === "analyze-website");
		if (analyzeStep?.status === "completed" && analyzeStep.data?.skipDetailedAnalysis) {
			// Skip detailed analysis - mark other steps as cancelled and go to review
			setSteps((prev) => {
				return prev.map((step) => {
					if (step.id !== "analyze-website" && step.status !== "completed") {
						return { ...step, status: "cancelled" as StepStatus };
					}
					return step;
				});
			});

			// Set wizard data with minimal information and go to review
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

		// Update blocked steps to pending if dependencies are met
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

	// Execute steps that are pending and have their dependencies met
	useEffect(() => {
		if (currentPhase !== "processing") return;

		const pendingSteps = steps.filter((step) => step.status === "pending");

		for (const step of pendingSteps) {
			// Get dependency data from completed steps
			const dependencyData = step.dependencies.reduce((acc, depId) => {
				const depStep = steps.find((s) => s.id === depId);
				if (depStep?.data) {
					if (depId === "analyze-website") {
						acc.products = depStep.data.products;
					}
				}
				return acc;
			}, {} as any);

			// Execute the step with dependency data
			executeStep(step.id, dependencyData);
		}
	}, [steps, currentPhase, executeStep]);

	// Check if all steps are completed and update wizard data
	useEffect(() => {
		const allCompleted = steps.every((step) => step.status === "completed");
		if (allCompleted && currentPhase === "processing") {
			// Update wizard data with results from completed steps
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

	// Create final prompts
	const createPrompts = async () => {
		if (!brand?.id) return;

		setIsCreatingPrompts(true);
		setCreatePromptsError(null);
		try {
			const result = await apiCalls.createPrompts(brand.id, wizardData);
			if (result.success) {
				await revalidate();
				onComplete();
			} else {
				setCreatePromptsError(result.error || "Failed to create prompts");
			}
		} catch (error) {
			console.error("Error creating prompts:", error);
			setCreatePromptsError(error instanceof Error ? error.message : "An unexpected error occurred");
		} finally {
			setIsCreatingPrompts(false);
		}
	};

	// Render idle phase (initial state)
	if (currentPhase === "idle") {
		return (
			<div className="max-w-2xl mx-auto space-y-6">
				<Card>
					<CardContent className="space-y-4">
						{steps.map((step) => (
							<div key={step.id} className="flex items-center gap-4">
								{/* Left half - Icon and name */}
								<div className="flex items-center gap-3 flex-1">
									{getStepStatusIcon(step.status)}
									<div>
										<div className="text-sm font-medium">{step.title}</div>
									</div>
								</div>

								{/* Right half - Progress bar placeholder */}
								<div className="flex-1">
									<Progress value={0} className="h-2 bg-muted/60 [&>*]:bg-muted-foreground/60" />
								</div>
							</div>
						))}
					</CardContent>
				</Card>

				<Button onClick={startProcessing} disabled={isGenerating} className="flex items-center gap-2 cursor-pointer">
					{isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
					{isGenerating ? "Generating..." : "Generate Prompts"}
				</Button>
			</div>
		);
	}

	// Render different phases
	if (currentPhase === "processing") {
		return (
			<div className="max-w-2xl mx-auto space-y-6">
				<Card>
					<CardContent className="space-y-4">
						{steps.map((step) => (
							<div key={step.id} className="flex items-center gap-4">
								{/* Left half - Icon and name */}
								<div className="flex items-center gap-3 flex-1">
									{getStepStatusIcon(step.status)}
									<div>
										<div className="text-sm font-medium">{step.title}</div>
									</div>
								</div>

								{/* Right half - Progress bar */}
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
					</CardContent>
				</Card>

				<Button disabled={true} className="flex items-center gap-2">
					<Loader2 className="h-4 w-4 animate-spin" />
					Generating...
				</Button>
			</div>
		);
	}

	if (currentPhase === "review") {
		return (
			<div className="max-w-2xl mx-auto space-y-6">
				{/* Completed Steps Status */}
				<Card>
					<CardContent className="space-y-4">
						{steps.map((step) => (
							<div key={step.id} className="flex items-center gap-4">
								{/* Left half - Icon and name */}
								<div className="flex items-center gap-3 flex-1">
									{getStepStatusIcon(step.status)}
									<div>
										<div className="text-sm font-medium">{step.title}</div>
									</div>
								</div>

								{/* Right half - Progress bar */}
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
						{wizardData.competitors.length < MAX_COMPETITORS && (
							<Button variant="outline" size="sm" onClick={addCompetitor} className="flex items-center gap-2">
								<Plus className="h-4 w-4" /> Add Competitor
							</Button>
						)}
						{wizardData.competitors.length >= MAX_COMPETITORS && (
							<p className="text-xs text-muted-foreground">
								Maximum of {MAX_COMPETITORS} competitors allowed. Remove a competitor to add a new one.
							</p>
						)}
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
						{wizardData.personaGroups.length >= 3 && (
							<p className="text-xs text-muted-foreground">
								Maximum of 3 groups allowed. Remove a group to add a new one.
							</p>
						)}
					</div>
				</div>

				<Separator />

				{/* Keywords Section */}
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
					<div className="space-y-2">
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
						<p className="text-muted-foreground">Review all prompts that will be created based on your selections.</p>
					</div>

				{/* Summary Card */}
				<Card className="bg-gradient-to-br from-background to-muted/30">
					<CardContent className="pt-6 pb-5">
						{/* Main stats row */}
						<div className="flex items-center justify-between mb-4">
							<div className="flex items-baseline gap-1">
								<span className="text-4xl font-bold tabular-nums">
									{promptsPreview.totalAfterCreation}
								</span>
								<span className="text-lg text-muted-foreground">total prompts</span>
							</div>
							<div className="text-right">
								{promptsPreview.newPromptsCount > 0 ? (
									<Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
										+{promptsPreview.newPromptsCount} new
									</Badge>
								) : (
									<Badge variant="secondary" className="text-xs">
										No changes
									</Badge>
								)}
							</div>
						</div>

						{/* Legend */}
						<div className="flex items-center gap-4 text-xs text-muted-foreground">
							<div className="flex items-center gap-1.5">
								<div className="w-2.5 h-2.5 rounded-full bg-gray-400 dark:bg-gray-600" />
								<span>Existing ({promptsPreview.existingCount})</span>
							</div>
							<div className="flex items-center gap-1.5">
								<div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
								<span>New ({promptsPreview.newPromptsCount})</span>
							</div>
						</div>
					</CardContent>
				</Card>

					{/* Breakdown */}
					<div className="space-y-2">
						{/* Existing Prompts */}
						{promptsPreview.existingCount > 0 && (
							<CollapsibleSection
								title="Existing Prompts"
								count={promptsPreview.existingCount}
								badgeColor="bg-gray-500"
							>
								<div className="max-h-48 overflow-y-auto bg-muted/30 p-3">
									<div className="space-y-1">
										{promptsPreview.existingPrompts.map((prompt) => (
											<div key={prompt.id} className="text-xs text-muted-foreground truncate">
												{prompt.value}
											</div>
										))}
									</div>
								</div>
							</CollapsibleSection>
						)}

						{/* Product Prompts */}
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

						{/* Product × Persona Prompts */}
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

						{/* Selected Keywords */}
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

						{/* Custom Prompts */}
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

						{/* No new prompts message */}
						{promptsPreview.newPromptsCount === 0 && (
							<div className="text-sm text-muted-foreground text-center py-4 border rounded-lg">
								No new prompts to create. Add products, targeting groups, keywords, or custom prompts above.
							</div>
						)}
					</div>
				</div>

				<Separator />

				{createPromptsError && (
					<div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
						<AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
						<div className="text-sm">{createPromptsError}</div>
					</div>
				)}

			<Button
				onClick={createPrompts}
				disabled={isCreatingPrompts || promptsPreview.newPromptsCount === 0}
				className="flex items-center gap-2 cursor-pointer"
			>
					{isCreatingPrompts ? (
						<>
							<Loader2 className="h-4 w-4 animate-spin" />
							Processing...
						</>
					) : (
						<>
							<Rocket className="h-4 w-4" />
							Start Tracking ({promptsPreview.newPromptsCount} new prompts)
						</>
					)}
				</Button>
			</div>
		);
	}

	return null;
}
