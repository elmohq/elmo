"use client";

import { lazy, Suspense } from "react";

const ApiReferenceReact = lazy(() =>
	Promise.all([
		import("@scalar/api-reference-react"),
		import("@scalar/api-reference-react/style.css"),
	]).then(([mod]) => ({
		default: mod.ApiReferenceReact,
	})),
);

export function OpenApiReference() {
	return (
		<Suspense
			fallback={
				<div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
					Loading API Reference...
				</div>
			}
		>
			<div className="not-prose -mx-4 md:-mx-6">
				<ApiReferenceReact
					configuration={{
						url: "/api/openapi.json",
						layout: "modern",
						theme: "default",
						darkMode: false,
						forceDarkModeState: "light",
						hideDarkModeToggle: true,
						hideSearch: true,
						showSidebar: false,
						defaultOpenAllTags: true,
						defaultHttpClient: {
							targetKey: "node",
							clientKey: "fetch",
						},
						agent: {
							disabled: true,
						},
					}}
				/>
			</div>
		</Suspense>
	);
}
