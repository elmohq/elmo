"use client";

import { useState, useEffect, useCallback, memo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, X, Sparkles } from "lucide-react";
import { useBrand } from "@/hooks/use-brands";
import { TagsInput } from "@/components/ui/tags-input";

interface WizardData {
	products: string[];
	competitors: string[];
	personaGroups: Array<{
		name: string;
		personas: string[];
	}>;
	keywords: Array<{ keyword: string; search_volume: number; difficulty: number; selected: boolean }>;
	reputationTerms: string[];
}

interface PromptWizardProps {
	onComplete: () => void;
}

interface EditableTagsInputProps {
	items: string[];
	onValueChange: (newValues: string[]) => void;
	placeholder?: string;
	maxItems?: number;
}

const EditableTagsInput = memo(({ 
	items, 
	onValueChange, 
	placeholder = "Add item...",
	maxItems = 10 
}: EditableTagsInputProps) => {
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
	const [currentStep, setCurrentStep] = useState(0);
	const [loading, setLoading] = useState(false);
	const [analysisProgress, setAnalysisProgress] = useState(0);
	const [localProducts, setLocalProducts] = useState<string[]>([]);
	const [wizardData, setWizardData] = useState<WizardData>({
		products: [],
		competitors: [],
		personaGroups: [],
		keywords: [],
		reputationTerms: [],
	});

	// Memoized callback functions to prevent unnecessary re-renders
	const handleLocalProductsChange = useCallback((newValues: string[]) => {
		setLocalProducts(newValues);
	}, []);

	const handleCompetitorsChange = useCallback((newValues: string[]) => {
		setWizardData(prev => ({ ...prev, competitors: newValues }));
	}, []);

	const handleReputationTermsChange = useCallback((newValues: string[]) => {
		setWizardData(prev => ({ ...prev, reputationTerms: newValues }));
	}, []);

	const handlePersonaGroupChange = useCallback((groupIndex: number, newValues: string[]) => {
		setWizardData(prev => {
			const newPersonaGroups = [...prev.personaGroups];
			newPersonaGroups[groupIndex] = {
				...newPersonaGroups[groupIndex],
				personas: newValues
			};
			return { ...prev, personaGroups: newPersonaGroups };
		});
	}, []);

	const steps = [
		"Analyze Website",
		"Review Products", 
		"Get Competitors",
		"Analyze Personas",
		"SEO Keywords",
		"Review & Create",
		"Complete"
	];

	const progress = ((currentStep + 1) / steps.length) * 100;

	const analyzeWebsite = async () => {
		if (!brand?.website) return;
		
		setLoading(true);
		setAnalysisProgress(0);
		
		// Start progress animation (30 seconds)
		const startTime = Date.now();
		const progressInterval = setInterval(() => {
			const elapsed = Date.now() - startTime;
			const progress = Math.min((elapsed / 30000) * 100, 95); // Cap at 95% until API completes
			setAnalysisProgress(progress);
		}, 100);
		
		try {
			const response = await fetch("/api/wizard/analyze-website", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ website: brand.website }),
			});
			
			if (response.ok) {
				const data = await response.json();
				setWizardData(prev => ({ ...prev, products: data.products }));
				setLocalProducts(data.products);
				
				// Rush to completion
				setAnalysisProgress(100);
				setTimeout(() => {
					setCurrentStep(1);
					setAnalysisProgress(0);
					setLoading(false);
				}, 300);
			} else {
				setLoading(false);
			}
		} catch (error) {
			console.error("Error analyzing website:", error);
			setLoading(false);
		} finally {
			clearInterval(progressInterval);
		}
	};

	const getCompetitors = async () => {
		setLoading(true);
		try {
			const response = await fetch("/api/wizard/get-competitors", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ products: wizardData.products }),
			});
			
			if (response.ok) {
				const data = await response.json();
				setWizardData(prev => ({ ...prev, competitors: data.competitors }));
				setCurrentStep(3);
			}
		} catch (error) {
			console.error("Error getting competitors:", error);
		} finally {
			setLoading(false);
		}
	};

	const getPersonas = async () => {
		setLoading(true);
		try {
			const response = await fetch("/api/wizard/get-personas", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ products: wizardData.products }),
			});
			
			if (response.ok) {
				const data = await response.json();
				setWizardData(prev => ({ ...prev, personaGroups: data.personaGroups }));
				setCurrentStep(4);
			}
		} catch (error) {
			console.error("Error getting personas:", error);
		} finally {
			setLoading(false);
		}
	};

	const getKeywords = async () => {
		if (!brand?.website) return;
		
		setLoading(true);
		try {
			const response = await fetch("/api/wizard/get-keywords", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ domain: brand.website }),
			});
			
			if (response.ok) {
				const data = await response.json();
				// Add selected property to each keyword (default to false)
				const keywordsWithSelection = data.keywords.map((kw: any) => ({
					...kw,
					selected: false
				}));
				setWizardData(prev => ({ ...prev, keywords: keywordsWithSelection }));
				// Generate reputation terms from products
				const reputationTerms = wizardData.products.map(product => `best ${product}`);
				setWizardData(prev => ({ ...prev, reputationTerms }));
				setCurrentStep(5);
			}
		} catch (error) {
			console.error("Error getting keywords:", error);
		} finally {
			setLoading(false);
		}
	};

	// Add function to handle keyword selection
	const handleKeywordSelection = useCallback((index: number, selected: boolean) => {
		setWizardData(prev => {
			const currentSelected = prev.keywords.filter(kw => kw.selected).length;
			
			// If trying to select and already at limit, don't allow
			if (selected && currentSelected >= 30) {
				return prev;
			}
			
			const newKeywords = [...prev.keywords];
			newKeywords[index] = { ...newKeywords[index], selected };
			return { ...prev, keywords: newKeywords };
		});
	}, []);

	// Add function to select all keywords
	const handleSelectAllKeywords = useCallback(() => {
		setWizardData(prev => {
			const keywordsToSelect = prev.keywords.slice(0, 30); // Only select first 30
			const updatedKeywords = prev.keywords.map((kw, index) => ({
				...kw,
				selected: index < 30 ? true : kw.selected
			}));
			return { ...prev, keywords: updatedKeywords };
		});
	}, []);

	// Add function to deselect all keywords
	const handleDeselectAllKeywords = useCallback(() => {
		setWizardData(prev => ({
			...prev,
			keywords: prev.keywords.map(kw => ({ ...kw, selected: false }))
		}));
	}, []);

	const createPrompts = async () => {
		if (!brand?.id) return;
		
		setLoading(true);
		try {
			// Only send selected keywords
			const selectedKeywords = wizardData.keywords.filter(kw => kw.selected);
			
			const response = await fetch("/api/wizard/create-prompts", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					brandId: brand.id,
					reputationTerms: wizardData.reputationTerms,
					competitors: wizardData.competitors,
					personaGroups: wizardData.personaGroups,
					keywords: selectedKeywords,
				}),
			});
			
			if (response.ok) {
				await revalidate();
				onComplete();
			}
		} catch (error) {
			console.error("Error creating prompts:", error);
		} finally {
			setLoading(false);
		}
	};

	const renderStep = () => {
		switch (currentStep) {
			case 0:
				return (
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Sparkles className="h-5 w-5" />
								Welcome to the Prompt Setup Wizard
							</CardTitle>
							<CardDescription>
								We'll analyze your website and help you create tracking prompts in a few simple steps.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="space-y-4">
								<div>
									<Label>Website to analyze</Label>
									<Input value={brand?.website || ""} disabled />
								</div>
								<Button 
									onClick={analyzeWebsite} 
									disabled={loading} 
									className="w-full relative overflow-hidden cursor-pointer"
								>
									{loading && (
										<div 
											className="absolute inset-0 bg-primary/20 transition-all duration-300"
											style={{
												width: `${analysisProgress}%`,
											}}
										/>
									)}
									<span className="relative z-10 flex items-center justify-center">
										{loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
										{loading ? `Analyzing Website... ${Math.round(analysisProgress)}%` : "Start Analysis"}
									</span>
								</Button>
							</div>
						</CardContent>
					</Card>
				);

			case 1:
				return (
					<Card>
						<CardHeader>
							<CardTitle>Review Product Categories</CardTitle>
							<CardDescription>
								We found these product types. Remove or add items as needed (up to 10).
							</CardDescription>
						</CardHeader>
						<CardContent>
							<EditableTagsInput
								items={localProducts}
								onValueChange={handleLocalProductsChange}
								placeholder="Add product category..."
							/>
							<Button 
								onClick={() => {
									setWizardData(prev => ({ ...prev, products: localProducts }));
									setCurrentStep(2);
								}} 
								className="w-full mt-4 cursor-pointer"
								disabled={localProducts.length === 0}
							>
								Continue
							</Button>
						</CardContent>
					</Card>
				);

			case 2:
				return (
					<Card>
						<CardHeader>
							<CardTitle>Find Competitors</CardTitle>
							<CardDescription>
								Let's identify your competitors based on the product categories.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Button onClick={getCompetitors} disabled={loading} className="w-full cursor-pointer">
								{loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
								Analyze Competitors
							</Button>
						</CardContent>
					</Card>
				);

			case 3:
				return (
					<Card>
						<CardHeader>
							<CardTitle>Review Competitors</CardTitle>
							<CardDescription>
								Edit your competitor list (up to 10 competitors).
							</CardDescription>
						</CardHeader>
						<CardContent>
							<EditableTagsInput
								items={wizardData.competitors}
								onValueChange={handleCompetitorsChange}
								placeholder="Add competitor..."
							/>
							<Button onClick={getPersonas} disabled={loading} className="w-full mt-4 cursor-pointer">
								{loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
								Analyze Target Personas
							</Button>
						</CardContent>
					</Card>
				);

			case 4:
				return (
					<Card>
						<CardHeader>
							<CardTitle>Target Persona Groups</CardTitle>
							<CardDescription>
								Review and edit your target audience groups (up to 3 groups, 5 items each).
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-6">
							{wizardData.personaGroups.map((group, groupIndex) => (
								<div key={groupIndex}>
									<Label className="text-sm font-medium">{group.name}</Label>
									<EditableTagsInput
										items={group.personas}
										onValueChange={(newValues) => handlePersonaGroupChange(groupIndex, newValues)}
										placeholder="Add persona..."
										maxItems={5}
									/>
								</div>
							))}
							<Button onClick={getKeywords} disabled={loading} className="w-full cursor-pointer">
								{loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
								Get SEO Keywords
							</Button>
						</CardContent>
					</Card>
				);

			case 5:
				const selectedKeywordsCount = wizardData.keywords.filter(kw => kw.selected).length;
				const maxKeywords = 30;
				const canSelectMore = selectedKeywordsCount < maxKeywords;
				
				return (
					<Card>
						<CardHeader>
							<CardTitle>SEO Keywords</CardTitle>
							<CardDescription>
								Select the keywords you want to track. These will be used to create SEO monitoring prompts.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-6">
							{wizardData.keywords.length > 0 ? (
								<div className="space-y-4">
									<div className="flex items-center justify-between">
										<div className="text-sm text-muted-foreground">
											<strong>{selectedKeywordsCount}/{maxKeywords}</strong> {selectedKeywordsCount >= maxKeywords ? " keywords selected. Remove a keyword to add a new one." : "keywords selected."}
										</div>
										<div className="flex gap-2">
											<Button
												variant="outline"
												size="sm"
												onClick={handleSelectAllKeywords}
												disabled={selectedKeywordsCount >= Math.min(maxKeywords, wizardData.keywords.length)}
											>
												Select All
											</Button>
											<Button
												variant="outline"
												size="sm"
												onClick={handleDeselectAllKeywords}
												disabled={selectedKeywordsCount === 0}
											>
												Deselect All
											</Button>
										</div>
									</div>
									
									<div className="max-h-64 overflow-y-auto border rounded-lg p-4 space-y-2">
										{wizardData.keywords.map((kw, index) => {
											const isDisabled = !kw.selected && !canSelectMore;
											return (
												<div
													key={index}
													className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
														isDisabled 
															? 'opacity-50 cursor-not-allowed' 
															: 'cursor-pointer hover:bg-muted/50'
													} ${
														kw.selected ? 'bg-primary/10 border-primary' : 'bg-background'
													}`}
													onClick={() => !isDisabled && handleKeywordSelection(index, !kw.selected)}
												>
													<div className="flex items-center space-x-3">
														<input
															type="checkbox"
															checked={kw.selected}
															onChange={(e) => handleKeywordSelection(index, e.target.checked)}
															className="rounded border-muted-foreground"
															disabled={isDisabled}
															onClick={(e) => e.stopPropagation()}
														/>
														<span className="font-medium">{kw.keyword}</span>
													</div>
													<div className="flex items-center space-x-2 text-sm text-muted-foreground">
														<Badge variant="secondary" className="text-xs">
															{kw.search_volume.toLocaleString()} volume
														</Badge>
														<Badge variant="outline" className="text-xs">
															{kw.difficulty}% difficulty
														</Badge>
													</div>
												</div>
											);
										})}
									</div>
								</div>
							) : (
								<div className="text-center py-8 text-muted-foreground">
									<p>No keywords found for this domain.</p>
									<p className="text-sm mt-2">This may happen if the domain is new or has limited search visibility.</p>
								</div>
							)}
							
							<Button 
								onClick={() => setCurrentStep(6)} 
								disabled={selectedKeywordsCount === 0} 
								className="w-full cursor-pointer"
							>
								Continue with {selectedKeywordsCount} Keyword{selectedKeywordsCount !== 1 ? 's' : ''}
							</Button>
						</CardContent>
					</Card>
				);

			case 6:
				return (
					<Card>
						<CardHeader>
							<CardTitle>Review & Create Prompts</CardTitle>
							<CardDescription>
								Final review of all data that will be used to create your tracking prompts.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-6">
							<div>
								<Label className="text-sm font-medium">Brand Reputation Terms ({wizardData.reputationTerms.length})</Label>
								<EditableTagsInput
									items={wizardData.reputationTerms}
									onValueChange={handleReputationTermsChange}
									placeholder="Add reputation term..."
								/>
							</div>
							
							<div>
								<Label className="text-sm font-medium">
									Selected SEO Keywords ({wizardData.keywords.filter(kw => kw.selected).length})
								</Label>
								<div className="flex flex-wrap gap-2 mt-2">
									{wizardData.keywords.filter(kw => kw.selected).slice(0, 10).map((kw, index) => (
										<Badge key={index} variant="outline" className="text-xs">
											{kw.keyword} ({kw.search_volume} volume, {kw.difficulty}% difficulty)
										</Badge>
									))}
									{wizardData.keywords.filter(kw => kw.selected).length > 10 && (
										<Badge variant="secondary" className="text-xs">
											+{wizardData.keywords.filter(kw => kw.selected).length - 10} more
										</Badge>
									)}
								</div>
							</div>

							<Button onClick={createPrompts} disabled={loading} className="w-full cursor-pointer">
								{loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
								Create All Prompts
							</Button>
						</CardContent>
					</Card>
				);

			default:
				return null;
		}
	};

	return (
		<div className="max-w-2xl mx-auto space-y-6">
			<div className="space-y-2">
				<div className="flex items-center justify-between">
					<h2 className="text-2xl font-bold">Setup Tracking Prompts</h2>
					<span className="text-sm text-muted-foreground">
						Step {currentStep + 1} of {steps.length}
					</span>
				</div>
				<Progress value={progress} className="w-full" />
				<p className="text-sm text-muted-foreground">{steps[currentStep]}</p>
				
				{/* Temporary debugging button */}
				<Button 
					variant="outline" 
					size="sm" 
					onClick={() => setCurrentStep(4)}
					className="text-xs"
				>
					🐛 Debug: Skip to SEO Keywords
				</Button>
			</div>

			{renderStep()}
		</div>
	);
} 