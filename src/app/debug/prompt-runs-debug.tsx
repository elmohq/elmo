"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Prompt = {
	id: string;
	brandId: string;
	groupCategory: string | null;
	groupPrefix: string | null;
	value: string;
	enabled: boolean;
	createdAt: string;
	brandName: string;
};

type PromptRun = {
	id: string;
	promptId: string;
	modelGroup: string;
	model: string;
	webSearchEnabled: boolean;
	rawOutput: any;
	webQueries: string[];
	brandMentioned: boolean;
	competitorsMentioned: string[];
	createdAt: string;
};

type PromptRunsResponse = {
	prompt: {
		id: string;
		brandId: string;
		value: string;
	};
	runs: PromptRun[];
};

export default function PromptRunsDebug() {
	const [prompts, setPrompts] = useState<Prompt[]>([]);
	const [selectedPromptId, setSelectedPromptId] = useState<string>("");
	const [promptRuns, setPromptRuns] = useState<PromptRunsResponse | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Fetch all prompts on component mount
	useEffect(() => {
		const fetchPrompts = async () => {
			try {
				const response = await fetch("/api/debug/prompts");
				if (!response.ok) {
					throw new Error("Failed to fetch prompts");
				}
				const data = await response.json();
				setPrompts(data);
			} catch (err) {
				console.error("Error fetching prompts:", err);
				setError("Failed to load prompts");
			}
		};

		fetchPrompts();
	}, []);

	// Fetch prompt runs when a prompt is selected
	const handlePromptSelect = async (promptId: string) => {
		setSelectedPromptId(promptId);
		setPromptRuns(null);
		setError(null);
		setLoading(true);

		try {
			const response = await fetch(`/api/debug/prompt-runs/${promptId}`);
			if (!response.ok) {
				throw new Error("Failed to fetch prompt runs");
			}
			const data = await response.json();
			setPromptRuns(data);
		} catch (err) {
			console.error("Error fetching prompt runs:", err);
			setError("Failed to load prompt runs");
		} finally {
			setLoading(false);
		}
	};

	const formatRawOutput = (rawOutput: any) => {
		if (typeof rawOutput === "string") {
			return rawOutput;
		}
		return JSON.stringify(rawOutput, null, 2);
	};

	const extractTextContent = (rawOutput: any, modelGroup: string): string => {
		try {
			switch (modelGroup) {
				case "openai":
					// OpenAI uses result.text from generateText
					if (rawOutput && typeof rawOutput.text === "string") {
						return rawOutput.text;
					}
					break;

				case "anthropic":
					// Anthropic uses response.content with text blocks
					if (rawOutput && Array.isArray(rawOutput.content)) {
						const textBlocks = rawOutput.content.filter((block: any) => block.type === "text");
						return textBlocks.map((block: any) => block.text).join("\n");
					}
					break;

				case "google":
					// DataForSEO uses AI overview markdown
					if (rawOutput && rawOutput.tasks && rawOutput.tasks.length > 0) {
						const task = rawOutput.tasks[0];
						if (task.result && task.result.length > 0) {
							const result = task.result[0];
							const items = result.items || [];
							const aiOverviewItems = items.filter((item: any) => item.type === "ai_overview");

							if (aiOverviewItems.length > 0 && aiOverviewItems[0].markdown) {
								return aiOverviewItems[0].markdown;
							}
						}
					}
					return "No AI overview content found.";

				default:
					return "Unknown model group - cannot extract text content.";
			}
		} catch (error) {
			console.error("Error extracting text content:", error);
			return "Error extracting text content.";
		}

		return "No text content found.";
	};

	const formatDate = (dateString: string) => {
		return new Date(dateString).toLocaleString();
	};

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Prompt Runs Debug</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="space-y-4">
						<div className="flex items-center gap-4">
							<label htmlFor="prompt-select" className="text-sm font-medium">
								Select Prompt:
							</label>
							<Select value={selectedPromptId} onValueChange={handlePromptSelect}>
								<SelectTrigger className="w-[400px]">
									<SelectValue placeholder="Choose a prompt to view its runs" />
								</SelectTrigger>
								<SelectContent>
									{prompts.map((prompt) => (
										<SelectItem key={prompt.id} value={prompt.id}>
											<div className="flex flex-col">
												<span className="font-medium">{prompt.value}</span>
												<span className="text-xs text-muted-foreground">
													{prompt.brandName} • {prompt.groupCategory || "No category"}
												</span>
											</div>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						{error && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-md">{error}</div>}

						{loading && <div className="text-blue-600 text-sm">Loading prompt runs...</div>}
					</div>
				</CardContent>
			</Card>

			{promptRuns && (
				<div className="space-y-4">
					<Card>
						<CardHeader>
							<CardTitle>Selected Prompt</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="space-y-2">
								<p>
									<strong>ID:</strong> {promptRuns.prompt.id}
								</p>
								<p>
									<strong>Brand ID:</strong> {promptRuns.prompt.brandId}
								</p>
								<p>
									<strong>Value:</strong> {promptRuns.prompt.value}
								</p>
								<p>
									<strong>Total Runs:</strong> {promptRuns.runs.length}
								</p>
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Prompt Runs ({promptRuns.runs.length})</CardTitle>
						</CardHeader>
						<CardContent>
							{promptRuns.runs.length === 0 ? (
								<p className="text-muted-foreground">No prompt runs found for this prompt.</p>
							) : (
								<div className="space-y-4">
									{promptRuns.runs.map((run, index) => (
										<Card key={run.id} className="border-l-4 border-l-blue-500">
											<CardHeader className="pb-3">
												<div className="flex items-center justify-between">
													<CardTitle className="text-lg">Run #{index + 1}</CardTitle>
													<Badge variant={run.brandMentioned ? "default" : "secondary"}>
														{run.brandMentioned ? "Brand Mentioned" : "No Brand Mention"}
													</Badge>
												</div>
											</CardHeader>
											<CardContent className="space-y-3">
												<div className="grid grid-cols-2 gap-4">
													<div>
														<strong>Model:</strong> {run.modelGroup} / {run.model}
													</div>
													<div>
														<strong>Web Search:</strong> {run.webSearchEnabled ? "Enabled" : "Disabled"}
													</div>
													<div>
														<strong>Created:</strong> {formatDate(run.createdAt)}
													</div>
													<div>
														<strong>ID:</strong> <code className="text-xs">{run.id}</code>
													</div>
												</div>

												{run.webQueries && run.webQueries.length > 0 && (
													<div>
														<strong>Web Queries:</strong>
														<ul className="list-disc list-inside mt-1 text-sm">
															{run.webQueries.map((query, qIndex) => (
																<li key={qIndex}>{query}</li>
															))}
														</ul>
													</div>
												)}

												{run.competitorsMentioned && run.competitorsMentioned.length > 0 && (
													<div>
														<strong>Competitors Mentioned:</strong>
														<div className="flex flex-wrap gap-1 mt-1">
															{run.competitorsMentioned.map((competitor, cIndex) => (
																<Badge key={cIndex} variant="outline">
																	{competitor}
																</Badge>
															))}
														</div>
													</div>
												)}

												<div>
													<strong>Extracted Text Content:</strong>
													<pre className="text-sm bg-blue-50 p-3 rounded-md mt-1 overflow-auto max-h-64 whitespace-pre-wrap">
														{extractTextContent(run.rawOutput, run.modelGroup)}
													</pre>
												</div>

												<div>
													<strong>Raw Output:</strong>
													<pre className="text-xs bg-gray-50 p-3 rounded-md mt-1 overflow-auto max-h-96">
														{formatRawOutput(run.rawOutput)}
													</pre>
												</div>
											</CardContent>
										</Card>
									))}
								</div>
							)}
						</CardContent>
					</Card>
				</div>
			)}
		</div>
	);
}
