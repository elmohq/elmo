"use client";

import { useState } from "react";
import Profile from "@/components/profile";
import PromptWizard from "@/components/prompt-wizard";
import { useBrand } from "@/hooks/use-brands";

export default function AppPage({ params }: { params: Promise<{ org: string }> }) {
	const { brand, isLoading } = useBrand();

	if (isLoading) {
		return (
			<div className="flex items-center justify-center min-h-[400px]">
				<div className="flex items-center space-x-2">
					<div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
					<span>Loading brand data...</span>
				</div>
			</div>
		);
	}

	const hasPrompts = brand?.prompts && brand.prompts.length > 0;

	if (!hasPrompts) {
		return (
			<div className="space-y-6">
				<div className="space-y-2">
					<h2 className="text-2xl font-bold">Research Brand Data</h2>
					<p className="text-muted-foreground text-balance">
						We will analyze your website and find the best generative AI prompts to track. This process may take a
						couple of minutes.
					</p>
				</div>
				<PromptWizard
					onComplete={() => {
						// The wizard will trigger a revalidation, so the page will update automatically
					}}
				/>
			</div>
		);
	}

	return (
		<div>
			<Profile />
		</div>
	);
}
