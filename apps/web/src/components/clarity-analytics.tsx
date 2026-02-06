"use client";

import { useEffect } from "react";

export default function ClarityAnalytics({ projectId }: { projectId: string }) {
	useEffect(() => {
		import("@microsoft/clarity").then((clarity) => {
			clarity.default.init(projectId);
		});
	}, [projectId]);

	return null;
}
