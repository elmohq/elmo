/**
 * The reference reads the instance's own spec, so a self-hosted or whitelabel
 * deployment documents itself instead of pointing at somebody else's site.
 */
import { createFileRoute } from "@tanstack/react-router";
import { DEFAULT_APP_NAME } from "@workspace/config/constants";
import { Card } from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";
import { lazy, Suspense, useEffect, useState } from "react";
import { CodeBlock } from "@/components/code-block";
import { CopyButton } from "@/components/copy-button";
import { DemoModeAlert } from "@/components/demo-mode-alert";
import { useAppOrigin } from "@/hooks/use-app-origin";
import { useBranding, useDeploymentMode } from "@/hooks/use-deployment-features";
import { pageHead } from "@/lib/route-head";

const OPENAPI_PATH = "/api/v1/openapi.json";

const ApiReference = lazy(() => import("@/components/api-reference"));

export const Route = createFileRoute("/_authed/app/org/$org/settings/api")({
	staticData: { crumb: "API Docs" },
	head: pageHead({ description: "Browse the REST API this deployment serves." }),
	component: ApiSettingsPage,
});

function ApiSettingsPage() {
	const appName = useBranding()?.name || DEFAULT_APP_NAME;
	const mode = useDeploymentMode();
	const origin = useAppOrigin();
	const baseUrl = `${origin}/api/v1`;

	return (
		<div className="space-y-6">
			<header className="space-y-1">
				<h1 className="text-3xl font-bold">API Docs</h1>
				<p className="max-w-2xl text-muted-foreground">Programmatic interface for {appName}.</p>
			</header>

			<DemoModeAlert>API access is disabled in demo mode.</DemoModeAlert>

			<div className="flex flex-wrap items-center gap-2">
				<span className="text-sm text-muted-foreground">Base URL</span>
				<code className="rounded-md border bg-muted/40 px-2 py-1 font-mono text-sm">{baseUrl}</code>
				<CopyButton value={baseUrl} />
			</div>

			{/* The SDKs are published under Elmo's name, so a whitelabel deployment doesn't advertise them. */}
			{mode && mode !== "whitelabel" && <SdkSection baseUrl={baseUrl} />}

			<Card className="overflow-hidden p-0">
				<ApiReferenceEmbed />
			</Card>
		</div>
	);
}

function sdkDocs(baseUrl: string) {
	const env = `export ELMO_API_KEY=YOUR_API_KEY\nexport ELMO_BASE_URL=${baseUrl}`;
	return [
		{
			value: "typescript",
			label: "TypeScript",
			install: "npm install @elmohq/sdk",
			env,
			usage: `import { Elmo } from "@elmohq/sdk";

const elmo = new Elmo();

for await (const brand of elmo.brands.list()) {
  console.log(brand.name);
}`,
		},
		{
			value: "python",
			label: "Python",
			install: "pip install elmo-sdk",
			env,
			usage: `from elmo_sdk import Elmo

elmo = Elmo()

for brand in elmo.brands.list():
    print(brand.name)`,
		},
	];
}

function SdkSection({ baseUrl }: { baseUrl: string }) {
	const sdks = sdkDocs(baseUrl);

	return (
		<section className="max-w-4xl space-y-3">
			<div className="space-y-1">
				<h2 className="text-lg font-semibold">SDKs</h2>
				<p className="text-sm text-muted-foreground">
					Typed clients for this API. Set the base URL — the SDKs can't know which deployment to call.
				</p>
			</div>
			<Tabs defaultValue={sdks[0].value}>
				<TabsList>
					{sdks.map((sdk) => (
						<TabsTrigger key={sdk.value} value={sdk.value}>
							{sdk.label}
						</TabsTrigger>
					))}
				</TabsList>
				{sdks.map((sdk) => (
					<TabsContent key={sdk.value} value={sdk.value} className="space-y-3 pt-2">
						<CodeBlock code={sdk.install} />
						<CodeBlock code={sdk.env} />
						<CodeBlock code={sdk.usage} />
					</TabsContent>
				))}
			</Tabs>
		</section>
	);
}

/** Scalar mounts a Vue app against a real element, so it is client-only. */
function ApiReferenceEmbed() {
	const [darkMode, setDarkMode] = useState<boolean | null>(null);

	useEffect(() => {
		setDarkMode(document.documentElement.classList.contains("dark"));
	}, []);

	if (darkMode === null) return <ReferenceSkeleton />;

	return (
		<Suspense fallback={<ReferenceSkeleton />}>
			<ApiReference url={OPENAPI_PATH} darkMode={darkMode} />
		</Suspense>
	);
}

function ReferenceSkeleton() {
	return (
		<div className="space-y-4 p-6">
			<Skeleton className="h-8 w-64" />
			<Skeleton className="h-4 w-full max-w-xl" />
			<Skeleton className="h-4 w-full max-w-md" />
			<Skeleton className="h-64 w-full" />
		</div>
	);
}
