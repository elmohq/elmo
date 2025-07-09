"use client";

import Profile from "@/components/profile";
import { useBrand } from "@/hooks/use-brands";

export default function AppPage({ params }: { params: Promise<{ org: string }> }) {
	const { brand } = useBrand();

	if(brand?.prompts.length === 0) {
		return (
			<div>
				<h1>No prompts found</h1>
			</div>
		);
	} else {
		return (
			<div>
				<Profile />
			</div>
		);
	}
}
