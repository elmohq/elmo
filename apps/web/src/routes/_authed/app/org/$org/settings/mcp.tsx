/**
 * Everything here is a fact about *this* deployment — the endpoint, the tools
 * actually registered, whether writes are served at all — so a whitelabel or
 * air-gapped instance never has to send anybody to elmohq.com to connect.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { DEFAULT_APP_NAME, MCP_PATH } from "@workspace/config/constants";
import { orgLinkParams } from "@workspace/lib/app-urls";
import { Badge } from "@workspace/ui/components/badge";
import { Card } from "@workspace/ui/components/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";
import { CodeBlock, InlineCode } from "@/components/code-block";
import { CopyButton } from "@/components/copy-button";
import { useAppOrigin } from "@/hooks/use-app-origin";
import { useBranding } from "@/hooks/use-deployment-features";
import { useOrganization } from "@/hooks/use-organizations";
import { pageHead } from "@/lib/route-head";
import { listMcpToolsFn, type McpPageData } from "@/server/mcp";

export const Route = createFileRoute("/_authed/app/org/$org/settings/mcp")({
	loader: (): Promise<McpPageData> => listMcpToolsFn(),
	staticData: { crumb: "MCP" },
	head: pageHead({ description: "Connect an AI client to this deployment over MCP." }),
	component: McpSettingsPage,
});

const KEY_PLACEHOLDER = "YOUR_API_KEY";

/** A client id has to survive a config file, so it is not the display name. */
function clientId(appName: string): string {
	const slug = appName
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
	return slug || "mcp";
}

function claudeCodeSnippet(id: string, endpoint: string): string {
	return `claude mcp add --transport http ${id} ${endpoint} \\\n  --header "Authorization: Bearer ${KEY_PLACEHOLDER}"`;
}

function jsonConfigSnippet(id: string, endpoint: string): string {
	return JSON.stringify(
		{
			mcpServers: {
				[id]: { url: endpoint, headers: { Authorization: `Bearer ${KEY_PLACEHOLDER}` } },
			},
		},
		null,
		2,
	);
}

function openCodeSnippet(id: string, endpoint: string): string {
	return JSON.stringify(
		{
			$schema: "https://opencode.ai/config.json",
			mcp: {
				[id]: {
					type: "remote",
					url: endpoint,
					enabled: true,
					headers: { Authorization: `Bearer ${KEY_PLACEHOLDER}` },
				},
			},
		},
		null,
		2,
	);
}

function McpSettingsPage() {
	const { tools, readOnlyDeployment } = Route.useLoaderData();
	const organization = useOrganization();
	const branding = useBranding();
	const origin = useAppOrigin();

	const appName = branding?.name || DEFAULT_APP_NAME;
	const endpoint = `${origin}${MCP_PATH}`;
	const id = clientId(appName);

	return (
		<div className="max-w-4xl space-y-8">
			<header className="space-y-1">
				<h1 className="text-3xl font-bold">MCP</h1>
				<p className="max-w-2xl text-muted-foreground">Connect any chat bot to {appName}.</p>
			</header>

			<div className="space-y-2">
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-sm text-muted-foreground">Endpoint</span>
					<code className="rounded-md border bg-muted/40 px-2 py-1 font-mono text-sm">{endpoint}</code>
					<CopyButton value={endpoint} />
				</div>
				<p className="text-sm text-muted-foreground">
					Authenticate with <InlineCode>Authorization: Bearer {KEY_PLACEHOLDER}</InlineCode>, using a key from{" "}
					<Link
						to="/app/org/$org/settings/api-keys"
						params={orgLinkParams(organization)}
						className="underline underline-offset-4"
					>
						API Keys
					</Link>
					.
				</p>
			</div>

			<section className="space-y-3">
				<div className="space-y-1">
					<h2 className="text-lg font-semibold">Connect a client</h2>
					<p className="text-sm text-muted-foreground">
						Swap {KEY_PLACEHOLDER} for a key you issued, and keep it out of anything you commit.
					</p>
				</div>
				<Tabs defaultValue="claude-code">
					<TabsList>
						<TabsTrigger value="claude-code">Claude Code</TabsTrigger>
						<TabsTrigger value="opencode">OpenCode</TabsTrigger>
						<TabsTrigger value="json">Cursor</TabsTrigger>
					</TabsList>
					<TabsContent value="claude-code" className="space-y-2 pt-2">
						<CodeBlock code={claudeCodeSnippet(id, endpoint)} />
					</TabsContent>
					<TabsContent value="opencode" className="space-y-2 pt-2">
						<p className="text-sm text-muted-foreground">
							In <InlineCode>opencode.json</InlineCode>.
						</p>
						<CodeBlock code={openCodeSnippet(id, endpoint)} />
					</TabsContent>
					<TabsContent value="json" className="space-y-2 pt-2">
						<p className="text-sm text-muted-foreground">
							Cursor reads <InlineCode>~/.cursor/mcp.json</InlineCode>; most other clients take the same shape.
						</p>
						<CodeBlock code={jsonConfigSnippet(id, endpoint)} />
					</TabsContent>
				</Tabs>
			</section>

			<section className="space-y-3">
				<div className="space-y-1">
					<h2 className="text-lg font-semibold">Tools</h2>
					<p className="text-sm text-muted-foreground">
						A connection is only offered the tools its key holds the scope for, so a client is never shown something it
						would then be refused.
						{readOnlyDeployment &&
							" This deployment is read-only, so the tools that write are withheld from every key."}
					</p>
				</div>
				<Card className="gap-0 overflow-hidden py-0">
					<Table className="[&_td]:px-4 [&_th]:px-4">
						<TableHeader>
							<TableRow className="hover:bg-transparent">
								<TableHead className="w-[22%]">Tool</TableHead>
								<TableHead>What it does</TableHead>
								<TableHead className="w-[24%]">Scope</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{tools.map((tool) => (
								<TableRow key={tool.name}>
									<TableCell className="font-mono text-xs text-foreground">{tool.name}</TableCell>
									<TableCell>{tool.title}</TableCell>
									<TableCell>
										{tool.scopes.length === 0 ? (
											<span className="text-muted-foreground">Any key</span>
										) : (
											<div className="flex flex-wrap gap-1">
												{tool.scopes.map((scope) => (
													<Badge key={scope} variant="secondary" className="font-mono font-normal">
														{scope}
													</Badge>
												))}
											</div>
										)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</Card>
			</section>
		</div>
	);
}
