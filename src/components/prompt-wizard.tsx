"use client";

import { useState, useCallback, memo, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle, Clock, AlertCircle, Play, Pause, Save } from "lucide-react";
import { useBrand } from "@/hooks/use-brands";
import { TagsInput } from "@/components/ui/tags-input";
import { Separator } from "@/components/ui/separator";

// Step status types
type StepStatus = 'pending' | 'running' | 'completed' | 'error' | 'blocked';

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
	competitors: string[];
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

const EditableTagsInput = memo(({ 
	items, 
	onValueChange, 
	placeholder = "Add item...",
	maxItems = 5 
}: {
	items: string[];
	onValueChange: (value: string[]) => void;
	placeholder?: string;
	maxItems?: number;
}) => {
	return (
		<div className="space-y-2">
			<TagsInput
				value={items}
				onValueChange={onValueChange}
				placeholder={placeholder}
				maxItems={maxItems}
			/>
			<p className="text-xs text-muted-foreground">
				<strong>{items.length}/{maxItems}</strong> {items.length >= maxItems ? " items added. Remove an item to add a new one." : "items entered."}
			</p>
		</div>
	);
});

EditableTagsInput.displayName = "EditableTagsInput";

export default function PromptWizard({ onComplete }: PromptWizardProps) {
	const { brand, revalidate } = useBrand();
	const [currentPhase, setCurrentPhase] = useState<'idle' | 'processing' | 'review' | 'complete'>('idle');
	const [isGenerating, setIsGenerating] = useState(false);
	const [wizardData, setWizardData] = useState<WizardData>({
		products: [],
		competitors: [],
		personaGroups: [],
		keywords: [],
		customPrompts: [],
	});
	
	// Track which steps have been started to prevent multiple executions
	const startedSteps = useRef<Set<string>>(new Set());
	
	// Track current progress for each step to ensure monotonic increase
	const stepProgress = useRef<Record<string, number>>({});
	
	// Track completed steps to prevent progress updates after completion
	const completedSteps = useRef<Set<string>>(new Set());

	// Initialize wizard steps
	const [steps, setSteps] = useState<WizardStep[]>([
		{
			id: 'get-keywords',
			title: 'Find SEO Keywords',
			dependencies: [],
			status: 'pending',
			progress: 0,
		},
		{
			id: 'analyze-website',
			title: 'Analyze Products',
			dependencies: [],
			status: 'pending',
			progress: 0,
		},
		{
			id: 'get-competitors',
			title: 'Discover Competitors',
			dependencies: ['analyze-website'],
			status: 'blocked',
			progress: 0,
		},
		{
			id: 'analyze-personas',
			title: 'Generate Personas',
			dependencies: ['analyze-website'],
			status: 'blocked',
			progress: 0,
		},
	]);

	// Helper to get step status icon
	const getStepStatusIcon = (status: StepStatus) => {
		switch (status) {
			case 'pending':
				return <Clock className="h-4 w-4 text-muted-foreground" />;
			case 'running':
				return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
			case 'completed':
				return <CheckCircle className="h-4 w-4 text-green-500" />;
			case 'error':
				return <AlertCircle className="h-4 w-4 text-red-500" />;
			case 'blocked':
				return <Clock className="h-4 w-4 text-muted-foreground" />;
			default:
				return <Clock className="h-4 w-4 text-muted-foreground" />;
		}
	};

	// Helper to update step status
	const updateStepStatus = useCallback((stepId: string, updates: Partial<WizardStep>) => {
		setSteps(prev => prev.map(step => 
			step.id === stepId ? { ...step, ...updates } : step
		));
	}, []);

	// Execute a single step
	const executeStep = useCallback(async (stepId: string, dependencyData?: any) => {
		// Check if step has already been started
		if (startedSteps.current.has(stepId)) return;
		
		// Add guard to prevent multiple executions
		setSteps(prev => {
			const step = prev.find(s => s.id === stepId);
			if (!step || step.status !== 'pending') return prev;
			
			// Mark this step as started
			startedSteps.current.add(stepId);
			
			// Mark as running immediately
			return prev.map(s => 
				s.id === stepId ? { ...s, status: 'running' as StepStatus, progress: 0 } : s
			);
		});

		try {
			switch (stepId) {
				case 'analyze-website':
					await executeAnalyzeWebsite(stepId);
					break;
				case 'get-keywords':
					await executeGetKeywords(stepId);
					break;
				case 'get-competitors':
					await executeGetCompetitors(stepId, dependencyData);
					break;
				case 'analyze-personas':
					await executeAnalyzePersonas(stepId, dependencyData);
					break;
			}
		} catch (error) {
			updateStepStatus(stepId, { 
				status: 'error', 
				error: error instanceof Error ? error.message : 'Unknown error'
			});
		}
	}, [updateStepStatus, brand]);

	// Individual step implementations
	const executeAnalyzeWebsite = async (stepId: string) => {
		if (!brand?.website) throw new Error('No website URL');
		
		// Initialize progress for this step
		stepProgress.current[stepId] = 0;
		completedSteps.current.delete(stepId);
		
		// Simulate progress with smooth monotonic increase
		const progressInterval = setInterval(() => {
			// Check if step is completed to prevent updates after completion
			if (completedSteps.current.has(stepId)) return;
			
			const currentProgress = stepProgress.current[stepId] || 0;
			const increment = Math.random() * 0.5 + 0.3; // Random increment between 0.3-0.8% (smoother)
			const newProgress = Math.min(95, currentProgress + increment);
			stepProgress.current[stepId] = newProgress;
			updateStepStatus(stepId, { progress: newProgress });
		}, 200); // Faster interval for smoother animation

		try {
			const response = await fetch("/api/wizard/analyze-website", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ website: brand.website }),
			});
			
			if (!response.ok) throw new Error('Failed to analyze website');
			
			const data = await response.json();
			setWizardData(prev => ({ ...prev, products: data.products }));
			
			// Mark step as completed to prevent further progress updates
			completedSteps.current.add(stepId);
			clearInterval(progressInterval);
			updateStepStatus(stepId, { status: 'completed', progress: 100, data: data.products });
		} finally {
			// Clean up progress tracking after a short delay to prevent flicker
			setTimeout(() => {
				delete stepProgress.current[stepId];
			}, 100);
		}
	};

	const executeGetKeywords = async (stepId: string) => {
		if (!brand?.website) throw new Error('No website URL');
		
		// Initialize progress for this step
		stepProgress.current[stepId] = 0;
		completedSteps.current.delete(stepId);
		
		const progressInterval = setInterval(() => {
			// Check if step is completed to prevent updates after completion
			if (completedSteps.current.has(stepId)) return;
			
			const currentProgress = stepProgress.current[stepId] || 0;
			const increment = Math.random() * 0.5 + 0.3; // Random increment between 0.3-0.8% (smoother)
			const newProgress = Math.min(95, currentProgress + increment);
			stepProgress.current[stepId] = newProgress;
			updateStepStatus(stepId, { progress: newProgress });
		}, 200); // Faster interval for smoother animation

		try {
			const response = await fetch("/api/wizard/get-keywords", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ domain: brand.website }),
			});
			
			if (!response.ok) throw new Error('Failed to get keywords');
			
			const data = await response.json();
			const keywordsWithSelection = data.keywords.map((kw: any) => ({
				...kw,
				selected: false
			}));
			setWizardData(prev => ({ ...prev, keywords: keywordsWithSelection }));
			
			// Mark step as completed to prevent further progress updates
			completedSteps.current.add(stepId);
			clearInterval(progressInterval);
			updateStepStatus(stepId, { status: 'completed', progress: 100, data: keywordsWithSelection });
		} finally {
			// Clean up progress tracking after a short delay to prevent flicker
			setTimeout(() => {
				delete stepProgress.current[stepId];
			}, 100);
		}
	};

	const executeGetCompetitors = async (stepId: string, dependencyData?: any) => {
		// Initialize progress for this step
		stepProgress.current[stepId] = 0;
		completedSteps.current.delete(stepId);
		
		const progressInterval = setInterval(() => {
			// Check if step is completed to prevent updates after completion
			if (completedSteps.current.has(stepId)) return;
			
			const currentProgress = stepProgress.current[stepId] || 0;
			const increment = Math.random() * 0.5 + 0.3; // Random increment between 0.3-0.8% (smoother)
			const newProgress = Math.min(95, currentProgress + increment);
			stepProgress.current[stepId] = newProgress;
			updateStepStatus(stepId, { progress: newProgress });
		}, 200); // Faster interval for smoother animation

		try {
			// Get current products from dependency data or wizard data
			const currentProducts = dependencyData?.products || wizardData.products;
			
			// Validate that we have products data
			if (!currentProducts || !Array.isArray(currentProducts) || currentProducts.length === 0) {
				throw new Error('No products data available for competitor analysis');
			}
			
			const response = await fetch("/api/wizard/get-competitors", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ products: currentProducts }),
			});
			
			if (!response.ok) throw new Error('Failed to get competitors');
			
			const data = await response.json();
			setWizardData(prev => ({ ...prev, competitors: data.competitors }));
			
			// Mark step as completed to prevent further progress updates
			completedSteps.current.add(stepId);
			clearInterval(progressInterval);
			updateStepStatus(stepId, { status: 'completed', progress: 100, data: data.competitors });
		} finally {
			// Clean up progress tracking after a short delay to prevent flicker
			setTimeout(() => {
				delete stepProgress.current[stepId];
			}, 100);
		}
	};

	const executeAnalyzePersonas = async (stepId: string, dependencyData?: any) => {
		// Initialize progress for this step
		stepProgress.current[stepId] = 0;
		completedSteps.current.delete(stepId);
		
		const progressInterval = setInterval(() => {
			// Check if step is completed to prevent updates after completion
			if (completedSteps.current.has(stepId)) return;
			
			const currentProgress = stepProgress.current[stepId] || 0;
			const increment = (Math.random() * 0.5 + 0.3) / 2; // 2x slower - Random increment between 0.15-0.4% (smoother)
			const newProgress = Math.min(95, currentProgress + increment);
			stepProgress.current[stepId] = newProgress;
			updateStepStatus(stepId, { progress: newProgress });
		}, 200); // Faster interval for smoother animation

		try {
			// Get current products from dependency data or wizard data
			const currentProducts = dependencyData?.products || wizardData.products;
			
			// Validate that we have products data
			if (!currentProducts || !Array.isArray(currentProducts) || currentProducts.length === 0) {
				throw new Error('No products data available for persona analysis');
			}
			
			const response = await fetch("/api/wizard/get-personas", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ products: currentProducts }),
			});
			
			if (!response.ok) throw new Error('Failed to analyze personas');
			
			const data = await response.json();
			setWizardData(prev => ({ ...prev, personaGroups: data.personaGroups }));
			
			// Mark step as completed to prevent further progress updates
			completedSteps.current.add(stepId);
			clearInterval(progressInterval);
			updateStepStatus(stepId, { status: 'completed', progress: 100, data: data.personaGroups });
		} finally {
			// Clean up progress tracking after a short delay to prevent flicker
			setTimeout(() => {
				delete stepProgress.current[stepId];
			}, 100);
		}
	};

	// Start all parallel processing
	const startProcessing = async () => {
		// Set loading state immediately
		setIsGenerating(true);
		
		// Clear started steps tracking
		startedSteps.current.clear();
		
		// Clear progress tracking
		stepProgress.current = {};
		
		// Clear completed steps tracking
		completedSteps.current.clear();
		
		setCurrentPhase('processing');
		
		// Start independent steps immediately
		const independentSteps = steps.filter(step => step.dependencies.length === 0);
		for (const step of independentSteps) {
			executeStep(step.id);
		}
	};

	// Monitor for dependency completion and start next steps
	useEffect(() => {
		if (currentPhase !== 'processing') return;
		
		// Update blocked steps to pending if dependencies are met, and start ready steps
		setSteps(prev => {
			let hasChanges = false;
			const updated = prev.map(step => {
				if (step.status === 'blocked') {
					const depsCompleted = step.dependencies.every(depId => {
						const depStep = prev.find(s => s.id === depId);
						return depStep?.status === 'completed';
					});
					if (depsCompleted) {
						hasChanges = true;
						// Get dependency data from completed steps
						const dependencyData = step.dependencies.reduce((acc, depId) => {
							const depStep = prev.find(s => s.id === depId);
							if (depStep?.data) {
								if (depId === 'analyze-website') {
									acc.products = depStep.data;
								}
							}
							return acc;
						}, {} as any);
						
						// Start the step immediately with dependency data
						executeStep(step.id, dependencyData);
						return { ...step, status: 'pending' as StepStatus };
					}
				}
				return step;
			});
			return hasChanges ? updated : prev;
		});
	}, [steps, currentPhase, executeStep]);

	// Check if all steps are completed
	useEffect(() => {
		const allCompleted = steps.every(step => step.status === 'completed');
		if (allCompleted && currentPhase === 'processing') {
			setCurrentPhase('review');
		}
	}, [steps, currentPhase, wizardData.products]);

	// Create final prompts
	const createPrompts = async () => {
		if (!brand?.id) return;
		
		try {
			const selectedKeywords = wizardData.keywords.filter(kw => kw.selected);
			
			const response = await fetch("/api/wizard/create-prompts", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					brandId: brand.id,
					competitors: wizardData.competitors,
					personaGroups: wizardData.personaGroups,
					keywords: selectedKeywords,
					customPrompts: wizardData.customPrompts,
				}),
			});
			
			if (response.ok) {
				await revalidate();
				onComplete();
			}
		} catch (error) {
			console.error("Error creating prompts:", error);
		}
	};

	// Render idle phase (initial state)
	if (currentPhase === 'idle') {
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

				<div className="flex">
					<Button 
						onClick={startProcessing} 
						disabled={isGenerating}
						className="flex items-center gap-2 cursor-pointer"
					>
						{isGenerating ? (
							<Loader2 className="h-4 w-4 animate-spin" />
						) : (
							<Play className="h-4 w-4" />
						)}
						{isGenerating ? 'Generating...' : 'Generate Prompts'}
					</Button>
				</div>
			</div>
		);
	}

	// Render different phases
	if (currentPhase === 'processing') {
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
									{(step.status === 'running' || step.status === 'completed' || step.status === 'blocked') && (
										<Progress 
											value={step.progress} 
											className="h-2 bg-muted/60 [&>*]:bg-muted-foreground/60"
										/>
									)}
									{step.status === 'error' && step.error && (
										<div className="text-xs text-red-600 bg-red-50 p-2 rounded">
											{step.error}
										</div>
									)}
								</div>
							</div>
						))}
					</CardContent>
				</Card>

				<div className="flex">
					<Button 
						disabled={true}
						className="flex items-center gap-2"
					>
						<Loader2 className="h-4 w-4 animate-spin" />
						Generating...
					</Button>
				</div>
			</div>
		);
	}

	if (currentPhase === 'review') {
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
									<Progress 
										value={step.progress} 
										className="h-2 bg-muted/60 [&>*]:bg-muted-foreground/60"
									/>
								</div>
							</div>
						))}
					</CardContent>
				</Card>

				{/* Products Section */}
				<div className="space-y-2">
					<h2 className="text-2xl font-bold">Review Product Categories</h2>
					<p className="text-muted-foreground">
						What are the main types of products you sell?
					</p>
					<EditableTagsInput
						items={wizardData.products}
						onValueChange={(products) => setWizardData(prev => ({ ...prev, products }))}
						placeholder="Add product..."
					/>
				</div>


				<Separator />

				{/* Competitors Section */}
				<div className="space-y-2">
					<h2 className="text-2xl font-bold">Review Competitors</h2>
					<p className="text-muted-foreground">
						Who are your primary competitors?
					</p>
					<EditableTagsInput
					items={wizardData.competitors}
					onValueChange={(competitors) => setWizardData(prev => ({ ...prev, competitors }))}
					placeholder="Add competitor..."
				/>
				</div>


				<Separator />

				{/* Persona Groups Section */}
				<div className="space-y-2">
					<h2 className="text-2xl font-bold">Review Target Personas</h2>
					<p className="text-muted-foreground">
						Review categories of people or use cases you want to track.
					</p>
					<div className="space-y-4">
					{wizardData.personaGroups.map((group, index) => (
						<div key={index}>
							<h4 className="font-medium text-sm mb-2">{group.name}</h4>
							<EditableTagsInput
								items={group.personas}
								onValueChange={(personas) => {
									const newGroups = [...wizardData.personaGroups];
									newGroups[index] = { ...group, personas };
									setWizardData(prev => ({ ...prev, personaGroups: newGroups }));
								}}
								placeholder="Add persona..."
							/>
						</div>
					))}
					</div>
				</div>

				<Separator />

				{/* Keywords Section */}
				<div className="space-y-2">
					<h2 className="text-2xl font-bold">Review SEO Keywords</h2>
					<p className="text-muted-foreground">
						What are some relevant SEO keywords for your brand?
					</p>
				</div>
				<div className="space-y-4">
					<div className="flex gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => {
								const updated = wizardData.keywords.map((kw, i) => ({
									...kw,
									selected: i < 30
								}));
								setWizardData(prev => ({ ...prev, keywords: updated }));
							}}
							className="cursor-pointer"
						>
							Select All
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={() => {
								const updated = wizardData.keywords.map(kw => ({
									...kw,
									selected: false
								}));
								setWizardData(prev => ({ ...prev, keywords: updated }));
							}}
							className="cursor-pointer"
						>
							Clear All
						</Button>
					</div>
					<div className="space-y-2">
						{wizardData.keywords.map((kw, index) => (
							<Label key={index} className="hover:bg-accent/50 flex items-center gap-3 rounded-lg border p-3 has-[[aria-checked=true]]:border-blue-600 has-[[aria-checked=true]]:bg-blue-50 dark:has-[[aria-checked=true]]:border-blue-900 dark:has-[[aria-checked=true]]:bg-blue-950 cursor-pointer">
								<Checkbox
									id={`keyword-${index}`}
									checked={kw.selected}
									onCheckedChange={(checked) => {
										const updated = [...wizardData.keywords];
										updated[index] = { ...kw, selected: checked === true };
										setWizardData(prev => ({ ...prev, keywords: updated }));
									}}
									className="data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600 data-[state=checked]:text-white dark:data-[state=checked]:border-blue-700 dark:data-[state=checked]:bg-blue-700"
								/>
								<div className="flex-1 font-normal">
									<p className="text-sm leading-none font-medium flex justify-between">
										{kw.keyword}
										<span className="text-muted-foreground ml-2 font-normal">
											{new Intl.NumberFormat("en-US", { notation: "compact" }).format(kw.search_volume)}/month ({kw.difficulty < 30 ? 'easy' : kw.difficulty > 70 ? 'hard' : 'medium'})
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
					<p className="text-muted-foreground">
						Add any additional prompts you want to track for your brand.
					</p>
					<EditableTagsInput
					items={wizardData.customPrompts}
					onValueChange={(customPrompts) => setWizardData(prev => ({ ...prev, customPrompts }))}
					placeholder="Add custom prompt..."
					maxItems={10}
				/>
				</div>

				<Separator />

				<div className="space-y-2">
				<Button onClick={createPrompts} className="flex items-center gap-2 cursor-pointer">
					<Save className="h-4 w-4" />
					Start Tracking
				</Button>
				</div>
			</div>
		);
	}

	return null;
} 