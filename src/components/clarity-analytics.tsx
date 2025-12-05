"use client";

import { useEffect } from "react";

export default function ClarityAnalytics() {
	useEffect(() => {
		// Import and initialize Microsoft Clarity
		import("@microsoft/clarity").then((clarity) => {
			// updated from sh0kibwp8u to ugzxywlmzn - 2025-12-05
			clarity.default.init("ugzxywlmzn");
		});
	}, []);

	return null; // This component doesn't render anything
}
