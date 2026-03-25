import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const ApiReferenceReact = lazy(() =>
	Promise.all([
		import("@scalar/api-reference-react"),
		import("@scalar/api-reference-react/style.css"),
	]).then(([mod]) => ({
		default: mod.ApiReferenceReact,
	})),
);

export const Route = createFileRoute("/api/v1/docs/")({
	component: ApiDocsPage,
});

function ApiDocsPage() {
	return (
		<div id="api-reference">
			<Suspense
				fallback={
					<div className="py-20 text-center text-sm text-gray-400">
						Loading API Reference...
					</div>
				}
			>
				<ApiReferenceReact
					configuration={{
						url: "/api/v1/openapi.json",
						layout: "modern",
						theme: "default",
						darkMode: false,
						forceDarkModeState: "light",
						hideDarkModeToggle: true,
						defaultOpenAllTags: true,
						showSidebar: false,
						hideClientButton: true,
						mcp: { disabled: true },
						agent: { disabled: true },
						customCss: `a[href="https://www.scalar.com"] { display: none; }`,
					}}
				/>
			</Suspense>
		</div>
	);
}
