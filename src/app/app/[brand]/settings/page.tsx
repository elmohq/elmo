"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useBrand } from "@/hooks/use-brands";
import { useRouter } from "next/navigation";

export default function BrandSettingsPage() {
	const { brand, isLoading, revalidate } = useBrand();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState("");
	const [success, setSuccess] = useState("");
	const router = useRouter();

	if (isLoading) {
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
			const website = formData.get("website") as string;

			const response = await fetch(`/api/brands/${brand.id}`, {
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ website }),
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "An error occurred");
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
		<div className="space-y-6">
			<div>
				<h1 className="text-3xl font-bold">Brand Settings</h1>
				<p className="text-muted-foreground">Manage your brand configuration</p>
			</div>

			<form action={handleSubmit} className="space-y-4">
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
