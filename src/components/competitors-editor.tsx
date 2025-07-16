"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X, Save, Inbox } from "lucide-react";
import { useRouter } from "next/navigation";

interface Competitor {
	id: string;
	brandId: string;
	name: string;
	domain: string;
	createdAt: Date;
	updatedAt: Date;
}

interface EditableCompetitor {
	id?: string;
	name: string;
	domain: string;
}

interface CompetitorsEditorProps {
	brandId: string;
}

export function CompetitorsEditor({ brandId }: CompetitorsEditorProps) {
	// Maximum limit (same as wizard)
	const MAX_COMPETITORS = 5;

	const [competitors, setCompetitors] = useState<EditableCompetitor[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);
	const router = useRouter();

	// Fetch existing competitors on component mount
	useEffect(() => {
		fetchCompetitors();
	}, [brandId]);

	const fetchCompetitors = async () => {
		try {
			const response = await fetch(`/api/brands/${brandId}/competitors`);
			if (response.ok) {
				const data: Competitor[] = await response.json();
				setCompetitors(data.map(c => ({
					id: c.id,
					name: c.name,
					domain: c.domain
				})));
			}
		} catch (error) {
			console.error("Error fetching competitors:", error);
		} finally {
			setIsLoading(false);
		}
	};

	const addCompetitor = () => {
		if (competitors.length < MAX_COMPETITORS) {
			setCompetitors([...competitors, { name: "", domain: "" }]);
		}
	};

	const removeCompetitor = (index: number) => {
		setCompetitors(competitors.filter((_, i) => i !== index));
	};

	const updateCompetitor = (index: number, field: keyof EditableCompetitor, value: string) => {
		const updated = [...competitors];
		updated[index] = { ...updated[index], [field]: value };
		setCompetitors(updated);
	};

	const saveCompetitors = async () => {
		setIsSaving(true);
		try {
			// Get valid competitors (non-empty name and domain)
			const validCompetitors = competitors.filter(c => c.name.trim() && c.domain.trim());
			
			// Check server-side limits before saving
			if (validCompetitors.length > MAX_COMPETITORS) {
				alert(`You can only have a maximum of ${MAX_COMPETITORS} competitors.`);
				setIsSaving(false);
				return;
			}
			
			// Delete all existing competitors
			const existingCompetitors = competitors.filter(c => c.id);
			for (const competitor of existingCompetitors) {
				if (competitor.id) {
					await fetch(`/api/brands/${brandId}/competitors/${competitor.id}`, {
						method: "DELETE",
					});
				}
			}

			// Create new competitors
			for (const competitor of validCompetitors) {
				await fetch(`/api/brands/${brandId}/competitors`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						name: competitor.name.trim(),
						domain: competitor.domain.trim(),
					}),
				});
			}

			router.push(`/app/${brandId}/reputation`);
		} catch (error) {
			console.error("Error saving competitors:", error);
			alert("Failed to save competitors");
		} finally {
			setIsSaving(false);
		}
	};

	const validCompetitorCount = competitors.filter(c => c.name.trim() && c.domain.trim()).length;
	const isAtLimit = competitors.length >= MAX_COMPETITORS;

	if (isLoading) {
		return (
			<div className="space-y-6">
				<div>
					<h2 className="text-3xl font-bold tracking-tight">Edit Competitors</h2>
					<p className="text-muted-foreground">Loading...</p>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div>
				<h2 className="text-3xl font-bold tracking-tight">Edit Competitors</h2>
				<p className="text-muted-foreground">Manage your competitive landscape for reputation tracking.</p>
			</div>

			<div className="space-y-4">
				{/* Header row - always shown */}
				<div className="grid grid-cols-12 gap-2 text-sm font-medium text-muted-foreground border-b pb-2">
					<div className="col-span-5">Competitor Name</div>
					<div className="col-span-6">Domain</div>
					<div className="col-span-1"></div>
				</div>

				{/* Content area - either placeholder or competitor rows */}
				{competitors.length === 0 ? (
					<div className="border-2 border-dashed border-muted rounded-lg min-h-48 flex items-center justify-center">
						<div className="text-center py-8 text-muted-foreground">
							<Inbox className="h-12 w-12 mx-auto mb-4 opacity-50" />
							<p>No competitors yet.</p>
						</div>
					</div>
				) : (
					<div className="space-y-4">
						{/* Competitor rows */}
						{competitors.map((competitor, index) => (
							<div key={index} className="grid grid-cols-12 gap-2 items-center">
								<Input
									value={competitor.name}
									onChange={(e) => updateCompetitor(index, "name", e.target.value)}
									placeholder="Competitor name"
									className="col-span-5"
								/>
								<Input
									value={competitor.domain}
									onChange={(e) => updateCompetitor(index, "domain", e.target.value)}
									placeholder="domain.com"
									className="col-span-6"
								/>
								<Button
									variant="outline"
									size="sm"
									onClick={() => removeCompetitor(index)}
									className="col-span-1 p-2 cursor-pointer"
								>
									<X className="h-4 w-4" />
								</Button>
							</div>
						))}
					</div>
				)}
				
				{/* Buttons - always shown */}
				<div className="flex gap-2 items-center">
					<Button onClick={saveCompetitors} disabled={isSaving} size="sm" className="flex items-center gap-2 cursor-pointer">
						{isSaving ? (
							<>Saving...</>
						) : (
							<>
								<Save className="h-4 w-4" />
								Save Competitors
							</>
						)}
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={addCompetitor}
						disabled={isAtLimit}
						className="flex items-center gap-2 cursor-pointer"
					>
						<Plus className="h-4 w-4" /> Add Competitor
					</Button>
					{isAtLimit && (
						<p className="text-xs text-muted-foreground">
							Maximum of {MAX_COMPETITORS} competitors allowed. Remove a competitor to add a new one.
						</p>
					)}
				</div>
				
				{/* Count information */}
				<div className="text-xs text-muted-foreground">
					<strong>{validCompetitorCount}/{MAX_COMPETITORS}</strong> competitors{validCompetitorCount >= MAX_COMPETITORS ? ' (maximum reached)' : ''}
				</div>
			</div>
		</div>
	);
} 