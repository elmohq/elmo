"use client";

import { useState, useCallback, memo, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, CheckCircle, Clock, AlertCircle, Play, Pause, Rocket, Plus, X } from "lucide-react";
import { useBrand } from "@/hooks/use-brands";
import { TagsInput } from "@/components/ui/tags-input";
import { Separator } from "@/components/ui/separator";

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
	competitors: Array<{ name: string; domain: string }>;
	personaGroups: Array<{
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

	async createPrompts(
		brandId: string,
		data: {
			products: string[];
			competitors: Array<{ name: string; domain: string }>;
			personaGroups: Array<{ name: string; personas: string[] }>;
			keywords: Array<{ keyword: string; search_volume: number; difficulty: number; selected: boolean }>;
			customPrompts: string[];
		},
	) {
		const selectedKeywords = data.keywords.filter((kw) => kw.selected);

		const response = await fetch("/api/wizard/create-prompts", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				brandId,
				products: data.products,
				competitors: data.competitors,
				personaGroups: data.personaGroups,
				keywords: selectedKeywords,
				customPrompts: data.customPrompts,
			}),
		});

		return response.ok;
	},

	async skipOnboarding(brandId: string) {
		const response = await fetch("/api/wizard/skip-onboarding", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ brandId }),
		});

		return response.ok;
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

export default function PromptWizard({ onComplete }: PromptWizardProps) {
	const { brand, revalidate } = useBrand();
	const [currentPhase, setCurrentPhase] = useState<"idle" | "processing" | "review" | "complete">("idle");
	const [isGenerating, setIsGenerating] = useState(false);
	const [wizardData, setWizardData] = useState<WizardData>({
		products: [],
		competitors: [],
		personaGroups: [],
		keywords: [],
		customPrompts: [],
	});

	const { steps, setSteps, executeStep, resetSteps } = useStepManager(brand);

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
							newWizardData.competitors = step.data.competitors;
							break;
						case "analyze-personas":
							newWizardData.personaGroups = step.data.personaGroups;
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

		try {
			const success = await apiCalls.createPrompts(brand.id, wizardData);
			if (success) {
				await revalidate();
				onComplete();
			}
		} catch (error) {
			console.error("Error creating prompts:", error);
		}
	};

	// Skip onboarding
	const skipOnboarding = async () => {
		if (!brand?.id) return;

		try {
			const success = await apiCalls.skipOnboarding(brand.id);
			if (success) {
				await revalidate();
				onComplete();
			}
		} catch (error) {
			console.error("Error skipping onboarding:", error);
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

				<div className="flex gap-2">
					<Button onClick={startProcessing} disabled={isGenerating} className="flex items-center gap-2 cursor-pointer">
						{isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
						{isGenerating ? "Generating..." : "Generate Prompts"}
					</Button>
					<Button
						variant="outline"
						onClick={skipOnboarding}
						disabled={isGenerating}
						className="flex items-center gap-2 cursor-pointer"
					>
						Skip
					</Button>
				</div>
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

				<div className="flex gap-2">
					<Button disabled={true} className="flex items-center gap-2">
						<Loader2 className="h-4 w-4 animate-spin" />
						Generating...
					</Button>
					<Button variant="outline" onClick={skipOnboarding} className="flex items-center gap-2 cursor-pointer">
						Skip
					</Button>
				</div>
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
					<EditableTagsInput
						items={wizardData.products}
						onValueChange={(products) => setWizardData((prev) => ({ ...prev, products }))}
						placeholder="Add product..."
					/>
				</div>

				<Separator />

				{/* Competitors Section */}
				<div className="space-y-2">
					<h2 className="text-2xl font-bold">Review Competitors</h2>
					<p className="text-muted-foreground">Who are your primary competitors?</p>
					<div className="space-y-4">
						{wizardData.competitors.map((competitor, index) => (
							<div key={index} className="flex gap-2 items-center p-3 border rounded-lg">
								<Input
									type="text"
									value={competitor.name}
									onChange={(e) => {
										const newCompetitors = [...wizardData.competitors];
										newCompetitors[index] = { ...competitor, name: e.target.value };
										setWizardData((prev) => ({ ...prev, competitors: newCompetitors }));
									}}
									placeholder="Competitor name"
									className="flex-1"
								/>
								<Input
									type="text"
									value={competitor.domain}
									onChange={(e) => {
										const newCompetitors = [...wizardData.competitors];
										newCompetitors[index] = { ...competitor, domain: e.target.value };
										setWizardData((prev) => ({ ...prev, competitors: newCompetitors }));
									}}
									placeholder="domain.com"
									className="flex-1"
								/>
								<Button
									variant="outline"
									size="sm"
									onClick={() => {
										const newCompetitors = [...wizardData.competitors];
										newCompetitors.splice(index, 1);
										setWizardData((prev) => ({ ...prev, competitors: newCompetitors }));
									}}
									className="p-2"
								>
									<X className="h-4 w-4" />
								</Button>
							</div>
						))}
						{wizardData.competitors.length < 3 && (
							<Button
								variant="outline"
								size="sm"
								onClick={() => {
									setWizardData((prev) => ({
										...prev,
										competitors: [...prev.competitors, { name: "", domain: "" }],
									}));
								}}
								className="flex items-center gap-2"
							>
								<Plus className="h-4 w-4" /> Add Competitor
							</Button>
						)}
						{wizardData.competitors.length >= 3 && (
							<p className="text-xs text-muted-foreground">
								Maximum of 3 competitors allowed. Remove a competitor to add a new one.
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
						{wizardData.personaGroups.map((group, index) => (
							<div key={index} className="space-y-3 p-4 border rounded-lg">
								<div className="flex items-center gap-2">
									<Input
										type="text"
										value={group.name}
										onChange={(e) => {
											const newGroups = [...wizardData.personaGroups];
											newGroups[index] = { ...group, name: e.target.value };
											setWizardData((prev) => ({ ...prev, personaGroups: newGroups }));
										}}
										placeholder="Group name"
										className="flex-1 cursor-pointer"
									/>
									<Button
										variant="outline"
										size="sm"
										onClick={() => {
											const newGroups = [...wizardData.personaGroups];
											newGroups.splice(index, 1);
											setWizardData((prev) => ({ ...prev, personaGroups: newGroups }));
										}}
										className="p-2 cursor-pointer"
									>
										<X className="h-4 w-4" />
									</Button>
								</div>
								<EditableTagsInput
									items={group.personas}
									onValueChange={(personas) => {
										const newGroups = [...wizardData.personaGroups];
										newGroups[index] = { ...group, personas };
										setWizardData((prev) => ({ ...prev, personaGroups: newGroups }));
									}}
									placeholder="Add item..."
									maxItems={4}
								/>
							</div>
						))}
						{wizardData.personaGroups.length < 3 && (
							<Button
								variant="outline"
								size="sm"
								onClick={() => {
									setWizardData((prev) => ({
										...prev,
										personaGroups: [...prev.personaGroups, { name: "", personas: [] }],
									}));
								}}
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
							onClick={() => {
								const updated = wizardData.keywords.map((kw, i) => ({
									...kw,
									selected: i < 30,
								}));
								setWizardData((prev) => ({ ...prev, keywords: updated }));
							}}
							className="cursor-pointer"
						>
							Select All
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={() => {
								const updated = wizardData.keywords.map((kw) => ({
									...kw,
									selected: false,
								}));
								setWizardData((prev) => ({ ...prev, keywords: updated }));
							}}
							className="cursor-pointer"
						>
							Clear All
						</Button>
					</div>
					<div className="space-y-2">
						{wizardData.keywords.map((kw, index) => (
							<Label
								key={index}
								className="hover:bg-accent/50 flex items-center gap-3 rounded-lg border p-3 has-[[aria-checked=true]]:border-blue-600 has-[[aria-checked=true]]:bg-blue-50 dark:has-[[aria-checked=true]]:border-blue-900 dark:has-[[aria-checked=true]]:bg-blue-950 cursor-pointer"
							>
								<Checkbox
									id={`keyword-${index}`}
									checked={kw.selected}
									onCheckedChange={(checked) => {
										const updated = [...wizardData.keywords];
										updated[index] = { ...kw, selected: checked === true };
										setWizardData((prev) => ({ ...prev, keywords: updated }));
									}}
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
						onValueChange={(customPrompts) => setWizardData((prev) => ({ ...prev, customPrompts }))}
						placeholder="Add custom prompt..."
						maxItems={10}
					/>
				</div>

				<Separator />

				<div className="space-y-2">
					<div className="flex gap-2">
						<Button onClick={createPrompts} className="flex items-center gap-2 cursor-pointer">
							<Rocket className="h-4 w-4" />
							Start Tracking
						</Button>
						<Button variant="outline" onClick={skipOnboarding} className="flex items-center gap-2 cursor-pointer">
							Cancel
						</Button>
					</div>
				</div>
			</div>
		);
	}

	return null;
}
