"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useBrand } from "@/hooks/use-brands";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

interface Competitor {
	name: string;
	domain: string;
}

export default function BrandSettingsPage() {
	const { brand, isLoading, revalidate } = useBrand();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState("");
	const [success, setSuccess] = useState("");
	const [competitors, setCompetitors] = useState<Competitor[]>([]);
	const [competitorsLoading, setCompetitorsLoading] = useState(true);
	const router = useRouter();

	// Fetch existing competitors
	useEffect(() => {
		if (brand?.id) {
			fetchCompetitors();
		}
	}, [brand?.id]);

	const fetchCompetitors = async () => {
		if (!brand?.id) return;
		
		setCompetitorsLoading(true);
		try {
			const response = await fetch(`/api/brands/${brand.id}/competitors`);
			if (response.ok) {
				const data = await response.json();
				setCompetitors(data.map((c: any) => ({
					name: c.name,
					domain: c.domain
				})));
			}
		} catch (error) {
			console.error("Error fetching competitors:", error);
		} finally {
			setCompetitorsLoading(false);
		}
	};

	const addCompetitor = () => {
		if (competitors.length < 5) {
			setCompetitors([...competitors, { name: "", domain: "" }]);
		}
	};

	const removeCompetitor = (index: number) => {
		setCompetitors(competitors.filter((_, i) => i !== index));
	};

	const updateCompetitor = (index: number, field: keyof Competitor, value: string) => {
		const updated = [...competitors];
		updated[index] = { ...updated[index], [field]: value };
		setCompetitors(updated);
	};

	if (isLoading || competitorsLoading) {
		return (
			<div className="space-y-6">
				<div>
					<h1 className="text-3xl font-bold">Brand Settings</h1>
					<p className="text-muted-foreground">Loading...</p>
				</div>
			</div>
		);
	}

	if (!brand) {
		return (
			<div className="space-y-6">
				<div>
					<h1 className="text-3xl font-bold">Brand Settings</h1>
					<p className="text-destructive">Brand not found</p>
				</div>
			</div>
		);
	}

	const handleSubmit = async (formData: FormData) => {
		setIsSubmitting(true);
		setError("");
		setSuccess("");

		try {
			const name = formData.get("name") as string;
			const website = formData.get("website") as string;

			// Update brand details
			const response = await fetch(`/api/brands/${brand.id}`, {
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ name, website }),
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "An error occurred");
			}

			// Update competitors
			const validCompetitors = competitors.filter(c => c.name.trim() && c.domain.trim());
			
			// Delete all existing competitors and create new ones
			const competitorsResponse = await fetch(`/api/brands/${brand.id}/competitors`, {
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ competitors: validCompetitors }),
			});

			if (!competitorsResponse.ok) {
				const competitorsData = await competitorsResponse.json();
				throw new Error(competitorsData.error || "Failed to update competitors");
			}

			setSuccess("Brand settings updated successfully!");
			await revalidate();
		} catch (err) {
			setError(err instanceof Error ? err.message : "An error occurred");
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="space-y-6 max-w-2xl">
			<div>
				<h1 className="text-3xl font-bold">Brand Settings</h1>
				<p className="text-muted-foreground">Manage your brand configuration</p>
			</div>

			<form action={handleSubmit} className="space-y-6">
				{/* Brand Details Section */}
				<div className="space-y-4">
					<h2 className="text-xl font-semibold">Brand Details</h2>
					
					<div className="space-y-2">
						<Label htmlFor="name">Brand Name</Label>
						<Input
							id="name"
							name="name"
							type="text"
							placeholder="Brand Name"
							defaultValue={brand.name}
							required
							disabled={isSubmitting}
						/>
						<p className="text-xs text-muted-foreground">Enter your brand's name</p>
					</div>

					<div className="space-y-2">
						<Label htmlFor="website">Website URL</Label>
						<Input
							id="website"
							name="website"
							type="url"
							placeholder="https://example.com"
							defaultValue={brand.website}
							required
							disabled={isSubmitting}
						/>
						<p className="text-xs text-muted-foreground">Enter your brand's website URL</p>
					</div>
				</div>

				<div className="space-y-4">
					<div>
						<h2 className="text-xl font-semibold">Competitors</h2>
						<p className="text-muted-foreground">Manage your competitive landscape for reputation tracking.</p>
					</div>

					<Alert variant="default" className="border-yellow-200 bg-yellow-50 text-yellow-800">
						<AlertTriangle className="h-4 w-4 text-yellow-600" />
						<AlertTitle>Warning</AlertTitle>
						<AlertDescription className="text-yellow-700">
							Updating competitors will only apply to future prompt evaluations.
						</AlertDescription>
					</Alert>
					
					<div className="space-y-4">
						{competitors.map((competitor, index) => (
							<div key={index} className="flex gap-2 items-center p-3 border rounded-lg">
								<Input
									type="text"
									value={competitor.name}
									onChange={(e) => updateCompetitor(index, "name", e.target.value)}
									placeholder="Competitor name"
									className="flex-1"
									disabled={isSubmitting}
								/>
								<Input
									type="text"
									value={competitor.domain}
									onChange={(e) => updateCompetitor(index, "domain", e.target.value)}
									placeholder="domain.com"
									className="flex-1"
									disabled={isSubmitting}
								/>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => removeCompetitor(index)}
									className="p-2 cursor-pointer"
									disabled={isSubmitting}
								>
									<X className="h-4 w-4" />
								</Button>
							</div>
						))}
						
						{competitors.length < 5 && (
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={addCompetitor}
								className="flex items-center gap-2 cursor-pointer"
								disabled={isSubmitting}
							>
								<Plus className="h-4 w-4" /> Add Competitor
							</Button>
						)}
						
						{competitors.length >= 5 && (
							<p className="text-xs text-muted-foreground">
								Maximum of 5 competitors allowed. Remove a competitor to add a new one.
							</p>
						)}
						
						<p className="text-xs text-muted-foreground">
							<strong>{competitors.filter(c => c.name.trim() && c.domain.trim()).length}/5</strong> competitors configured
						</p>
					</div>
				</div>

				{error && <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">{error}</div>}

				{success && <div className="text-sm text-green-600 bg-green-50 p-3 rounded-md">{success}</div>}

				<div className="flex gap-2">
					<Button type="submit" disabled={isSubmitting} className="cursor-pointer">
						{isSubmitting ? "Saving..." : "Save Changes"}
					</Button>
				</div>
			</form>
		</div>
	);
}
