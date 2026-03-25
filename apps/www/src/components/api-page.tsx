import { useState } from "react";
import { Badge } from "@workspace/ui/components/badge";
import spec from "@workspace/api-spec";

const methodColors: Record<string, string> = {
	get: "bg-blue-100 text-blue-800 border-blue-200",
	post: "bg-green-100 text-green-800 border-green-200",
	put: "bg-amber-100 text-amber-800 border-amber-200",
	patch: "bg-orange-100 text-orange-800 border-orange-200",
	delete: "bg-red-100 text-red-800 border-red-200",
};

interface Operation {
	path: string;
	method: string;
}

interface ParameterSchema {
	name: string;
	in: string;
	required?: boolean;
	description?: string;
	schema?: {
		type?: string;
		format?: string;
		minimum?: number;
		maximum?: number;
		default?: number | string;
	};
}

function resolveRef(ref: string): Record<string, unknown> | undefined {
	const path = ref.replace("#/", "").split("/");
	let current: unknown = spec;
	for (const segment of path) {
		if (current && typeof current === "object" && segment in current) {
			current = (current as Record<string, unknown>)[segment];
		} else {
			return undefined;
		}
	}
	return current as Record<string, unknown>;
}

function SchemaView({ schema, depth = 0 }: { schema: Record<string, unknown>; depth?: number }) {
	if (schema.$ref) {
		const resolved = resolveRef(schema.$ref as string);
		if (resolved) return <SchemaView schema={resolved} depth={depth} />;
		return <code className="text-xs">{String(schema.$ref)}</code>;
	}

	if (schema.type === "object" && schema.properties) {
		const properties = schema.properties as Record<string, Record<string, unknown>>;
		const required = (schema.required as string[]) || [];
		return (
			<div className={depth > 0 ? "ml-4 border-l pl-4" : ""}>
				{Object.entries(properties).map(([name, prop]) => (
					<div key={name} className="py-2 border-b border-dashed last:border-0">
						<div className="flex items-center gap-2">
							<code className="text-sm font-semibold">{name}</code>
							<span className="text-xs text-muted-foreground">
								{String(prop.type || "")}
								{prop.format ? ` (${prop.format})` : ""}
							</span>
							{required.includes(name) && (
								<Badge variant="outline" className="text-[10px] px-1 py-0">required</Badge>
							)}
						</div>
						{!!prop.description && (
							<p className="text-sm text-muted-foreground mt-1">{String(prop.description)}</p>
						)}
						{prop.type === "object" && !!prop.properties && (
							<SchemaView schema={prop as Record<string, unknown>} depth={depth + 1} />
						)}
						{prop.type === "array" && !!prop.items && (
							<div className="ml-4 mt-1">
								<span className="text-xs text-muted-foreground">items:</span>
								<SchemaView schema={prop.items as Record<string, unknown>} depth={depth + 1} />
							</div>
						)}
					</div>
				))}
			</div>
		);
	}

	if (schema.type === "array" && schema.items) {
		return (
			<div>
				<span className="text-xs text-muted-foreground">array of:</span>
				<SchemaView schema={schema.items as Record<string, unknown>} depth={depth} />
			</div>
		);
	}

	return <code className="text-xs">{String(schema.type || "unknown")}</code>;
}

function ResponseBlock({ status, response }: { status: string; response: Record<string, unknown> }) {
	const [open, setOpen] = useState(false);

	const content = response.content as Record<string, Record<string, unknown>> | undefined;
	const jsonSchema = content?.["application/json"]?.schema as Record<string, unknown> | undefined;
	const example = content?.["application/json"]?.example;

	return (
		<div className="border rounded-lg overflow-hidden">
			<button
				onClick={() => setOpen(!open)}
				className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-muted/50"
			>
				<Badge
					variant="outline"
					className={status.startsWith("2") ? "border-green-300 text-green-700" : "border-red-300 text-red-700"}
				>
					{status}
				</Badge>
				<span className="text-muted-foreground">{String(response.description || "")}</span>
				<span className="ml-auto text-xs text-muted-foreground">{open ? "▼" : "▶"}</span>
			</button>
			{open && jsonSchema && (
				<div className="border-t px-4 py-3 bg-muted/20">
					{!!example && (
						<details className="mb-3">
							<summary className="cursor-pointer text-xs font-medium text-muted-foreground">Example</summary>
							<pre className="mt-2 rounded bg-muted p-3 text-xs overflow-x-auto">
								{JSON.stringify(example, null, 2)}
							</pre>
						</details>
					)}
					<SchemaView schema={jsonSchema} />
				</div>
			)}
		</div>
	);
}

export function APIPage({ operations }: { document: string; operations: Operation[] }) {
	const paths = spec.paths as Record<string, Record<string, Record<string, unknown>>>;

	return (
		<div className="space-y-8">
			{operations.map(({ path, method }) => {
				const operation = paths[path]?.[method];
				if (!operation) return null;

				const parameters = (operation.parameters || []) as ParameterSchema[];
				const requestBody = operation.requestBody as Record<string, unknown> | undefined;
				const responses = operation.responses as Record<string, Record<string, unknown>>;
				const serverUrl = (spec.servers as Array<{ url: string }>)?.[0]?.url || "";

				return (
					<div key={`${method}-${path}`}>
						<div className="flex items-center gap-3 mb-4">
							<Badge className={`${methodColors[method]} uppercase font-mono text-xs px-2 py-0.5`}>
								{method}
							</Badge>
							<code className="text-sm font-medium">{serverUrl}{path}</code>
						</div>

						{!!operation.description && (
							<p className="text-sm text-muted-foreground mb-6">{String(operation.description)}</p>
						)}

						{parameters.length > 0 && (
							<div className="mb-6">
								<h3 className="text-sm font-semibold mb-3">Parameters</h3>
								<div className="border rounded-lg divide-y">
									{parameters.map((param) => (
										<div key={param.name} className="px-4 py-3">
											<div className="flex items-center gap-2">
												<code className="text-sm font-semibold">{param.name}</code>
												<Badge variant="outline" className="text-[10px] px-1 py-0">{param.in}</Badge>
												<span className="text-xs text-muted-foreground">
													{param.schema?.type}
													{param.schema?.format ? ` (${param.schema.format})` : ""}
												</span>
												{param.required && (
													<Badge variant="outline" className="text-[10px] px-1 py-0 border-red-200 text-red-600">required</Badge>
												)}
											</div>
											{param.description && (
												<p className="text-sm text-muted-foreground mt-1">{param.description}</p>
											)}
											{param.schema?.default !== undefined && (
												<p className="text-xs text-muted-foreground mt-0.5">Default: {String(param.schema.default)}</p>
											)}
										</div>
									))}
								</div>
							</div>
						)}

						{requestBody && (
							<div className="mb-6">
								<h3 className="text-sm font-semibold mb-3">Request Body</h3>
								{(() => {
									const content = requestBody.content as Record<string, Record<string, unknown>> | undefined;
									const schema = content?.["application/json"]?.schema as Record<string, unknown> | undefined;
									if (!schema) return null;
									const resolved = schema.$ref ? resolveRef(schema.$ref as string) : schema;
									if (!resolved) return null;
									return (
										<div className="border rounded-lg px-4 py-3">
											<SchemaView schema={resolved} />
										</div>
									);
								})()}
							</div>
						)}

						{responses && (
							<div>
								<h3 className="text-sm font-semibold mb-3">Responses</h3>
								<div className="space-y-2">
									{Object.entries(responses).map(([status, response]) => {
										const resolved = response.$ref
											? resolveRef(response.$ref as string) as Record<string, unknown>
											: response as Record<string, unknown>;
										if (!resolved) return null;
										return <ResponseBlock key={status} status={status} response={resolved} />;
									})}
								</div>
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}
