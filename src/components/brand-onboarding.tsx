"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useRouter } from "next/navigation";
import FullPageCard from "@/components/full-page-card";

interface BrandOnboardingProps {
	brandId: string;
	brandName: string;
}

export default function BrandOnboarding({ brandId, brandName }: BrandOnboardingProps) {
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState("");
	const router = useRouter();

	const handleSubmit = async (formData: FormData) => {
		setIsLoading(true);
		setError("");

		try {
			const response = await fetch('/api/brands', {
				method: 'POST',
				body: formData,
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'An error occurred');
			}

			// API will revalidate the path, so refresh to show Profile
			router.refresh();
		} catch (err) {
			setError(err instanceof Error ? err.message : "An error occurred");
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<FullPageCard title={`Setup ${brandName}`} subtitle="Configure your brand to get started" showBackButton={true}>
			<form action={handleSubmit} className="space-y-4">
				<input type="hidden" name="brandId" value={brandId} />
				<input type="hidden" name="brandName" value={brandName} />

				<div className="space-y-2">
					<Label htmlFor="website">Website URL</Label>
					<Input
						id="website"
						name="website"
						type="url"
						placeholder="https://example.com"
						required
						disabled={isLoading}
					/>
					<p className="text-xs text-muted-foreground">Enter your brand's website URL</p>
				</div>

				{error && <p className="text-sm text-destructive">{error}</p>}

				<Button type="submit" className="w-full" disabled={isLoading}>
					{isLoading ? "Setting up..." : "Complete Setup"}
				</Button>
			</form>
		</FullPageCard>
	);
}
