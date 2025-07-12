"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Hash, Users, Search, Target } from "lucide-react";

interface Prompt {
	id: string;
	brandId: string;
	group: string | null;
	value: string;
	reputation: boolean;
	enabled: boolean;
	createdAt: Date;
}

interface PromptsDisplayProps {
	prompts: Prompt[];
	pageTitle: string;
	pageDescription: string;
}

function getGroupIcon(groupName: string) {
	switch (groupName) {
		case "SEO Keywords":
			return <Search className="h-4 w-4" />;
		case "Competitors":
			return <Target className="h-4 w-4" />;
		case "Custom Prompts":
			return <Plus className="h-4 w-4" />;
		case "Product Categories":
			return <Hash className="h-4 w-4" />;
		default:
			return <Users className="h-4 w-4" />;
	}
}

function getGroupColor(groupName: string) {
	switch (groupName) {
		case "SEO Keywords":
			return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
		case "Competitors":
			return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
		case "Custom Prompts":
			return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
		case "Product Categories":
			return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
		default:
			return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
	}
}

export function PromptsDisplay({ prompts, pageTitle, pageDescription }: PromptsDisplayProps) {
	// Group prompts by category
	const promptsByGroup = prompts.reduce(
		(acc, prompt) => {
			const group = prompt.group || "Uncategorized";
			if (!acc[group]) {
				acc[group] = [];
			}
			acc[group].push(prompt);
			return acc;
		},
		{} as Record<string, Prompt[]>,
	);

	const groupEntries = Object.entries(promptsByGroup);

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-3xl font-bold">{pageTitle}</h1>
				<p className="text-muted-foreground">{pageDescription}</p>
			</div>

			{groupEntries.length === 0 ? (
				<div className="text-center py-12">
					<Hash className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
					<h2 className="text-2xl font-semibold mb-2">No prompts yet</h2>
					<p className="text-muted-foreground mb-4">
						Get started by running the prompt wizard to generate your first tracking prompts.
					</p>
					<Button className="cursor-pointer">
						<Plus className="h-4 w-4 mr-2" />
						Run Prompt Wizard
					</Button>
				</div>
			) : (
				<div className="space-y-6">
					{groupEntries.map(([groupName, groupPrompts]) => (
						<Card key={groupName}>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									{getGroupIcon(groupName)}
									{groupName}
									<Badge variant="secondary" className="ml-2">
										{groupPrompts.length} {groupPrompts.length === 1 ? "prompt" : "prompts"}
									</Badge>
								</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="grid gap-2">
									{groupPrompts.map((prompt) => (
										<div key={prompt.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
											<div className="flex items-center gap-3">
												<div className="flex-1">
													<p className="font-medium">{prompt.value}</p>
													<div className="flex items-center gap-2 mt-1">
														<Badge variant="outline" className={`text-xs ${getGroupColor(groupName)}`}>
															{groupName}
														</Badge>
														{prompt.reputation && (
															<Badge variant="outline" className="text-xs">
																Reputation
															</Badge>
														)}
														{!prompt.enabled && (
															<Badge variant="outline" className="text-xs text-muted-foreground">
																Disabled
															</Badge>
														)}
													</div>
												</div>
											</div>
											<div className="flex items-center gap-2">
												<Badge variant={prompt.enabled ? "default" : "secondary"}>
													{prompt.enabled ? "Active" : "Inactive"}
												</Badge>
											</div>
										</div>
									))}
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			)}
		</div>
	);
}
