"use client";

import { useState } from "react";
import Profile from "@/components/profile";
import PromptWizard from "@/components/prompt-wizard";
import { useBrand } from "@/hooks/use-brands";

export default function AppPage({ params }: { params: Promise<{ org: string }> }) {
	const { brand, isLoading } = useBrand();
	const [showWizard, setShowWizard] = useState(false);

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

	if (!hasPrompts && !showWizard) {
		return (
			<div className="flex flex-col items-center justify-center min-h-[400px] text-center space-y-4">
				<h1 className="text-2xl font-bold">No tracking prompts found</h1>
				<p className="text-muted-foreground max-w-md">
					Get started by setting up tracking prompts for your brand. 
					We'll analyze your website and help you create relevant prompts automatically.
				</p>
				<button 
					onClick={() => setShowWizard(true)}
					className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors cursor-pointer"
				>
					Setup Tracking Prompts
				</button>
			</div>
		);
	}

	if (!hasPrompts && showWizard) {
		return (
			<PromptWizard 
				onComplete={() => {
					setShowWizard(false);
					// The wizard will trigger a revalidation, so the page will update automatically
				}} 
			/>
		);
	}

	return (
		<div>
			<Profile />
		</div>
	);
}
