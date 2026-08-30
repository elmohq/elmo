/**
 * /reports - Reports list page
 *
 * Requires admin OR report generator access.
 * Replicates: apps/web/src/app/reports/page.tsx + reports-content.tsx
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Spinner } from "@workspace/ui/components/spinner";
import { Textarea } from "@workspace/ui/components/textarea";
import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { AppShell, PageContent } from "@/components/app-shell";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { trackEvent } from "@/lib/posthog";
import { pageHead } from "@/lib/route-head";
import { createReportFn, getReportsFn } from "@/server/reports";

export const Route = createFileRoute("/_authed/reports/")({
	staticData: { crumb: "Reports" },
	head: pageHead({ description: "Generate and view one-time brand reports." }),
	beforeLoad: ({ context }) => {
		if (!context.isAdmin && !context.hasReportAccess) throw notFound();
	},
	component: ReportsPage,
});

function ReportsPage() {
	const queryClient = useQueryClient();

	const {
		data: reports = [],
		error,
		isLoading,
	} = useQuery({
		queryKey: ["reports"],
		queryFn: () => getReportsFn(),
		refetchInterval: 5000,
		staleTime: 2000,
	});

	const [formData, setFormData] = useState({
		brandName: "",
		brandWebsite: "",
		manualPrompts: "",
	});
	const [submitError, setSubmitError] = useState("");
	const [success, setSuccess] = useState("");

	const createMutation = useMutation({
		mutationFn: (data: typeof formData) => createReportFn({ data }),
		onSuccess: (_data, variables) => {
			trackEvent("report_created", { has_manual_prompts: Boolean(variables.manualPrompts) });
			setSuccess("Report request submitted successfully!");
			setFormData({ brandName: "", brandWebsite: "", manualPrompts: "" });
			queryClient.invalidateQueries({ queryKey: ["reports"] });
		},
		onError: (err: Error) => {
			setSubmitError(err.message || "An error occurred");
		},
	});

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		setSubmitError("");
		setSuccess("");
		createMutation.mutate(formData);
	};

	const getStatusBadgeVariant = (status: string) => {
		switch (status) {
			case "completed":
				return "default" as const;
			case "processing":
				return "secondary" as const;
			case "failed":
				return "destructive" as const;
			default:
				return "outline" as const;
		}
	};

	const extractDomain = (url: string) => {
		try {
			return new URL(url).hostname.replace("www.", "");
		} catch {
			return url;
		}
	};

	return (
		<AppShell sidebar={<AppSidebar scope="admin" />} header={<SiteHeader />}>
			<PageContent>
				<div className="space-y-8">
					<div className="space-y-2">
						<h1 className="text-3xl font-bold tracking-tight">Reports</h1>
						<p className="text-muted-foreground">Generate one-time brand reports.</p>
					</div>
					<div className="space-y-6 max-w-4xl">
						<div className="space-y-4">
							<h2 className="text-2xl font-semibold">Create New Report</h2>

							<form onSubmit={handleSubmit} className="space-y-4">
								<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
									<div className="space-y-2">
										<Label htmlFor="brandName">Brand Name</Label>
										<Input
											id="brandName"
											type="text"
											placeholder="Enter brand name"
											value={formData.brandName}
											onChange={(e) => setFormData({ ...formData, brandName: e.target.value })}
											required
											disabled={createMutation.isPending}
										/>
									</div>
									<div className="space-y-2">
										<Label htmlFor="brandWebsite">Brand Website</Label>
										<Input
											id="brandWebsite"
											type="url"
											placeholder="https://example.com"
											value={formData.brandWebsite}
											onChange={(e) => setFormData({ ...formData, brandWebsite: e.target.value })}
											required
											disabled={createMutation.isPending}
										/>
									</div>
								</div>

								<div className="space-y-2">
									<Label htmlFor="manualPrompts">
										Manual Prompts <span className="text-muted-foreground font-normal">(Optional)</span>
									</Label>
									<Textarea
										id="manualPrompts"
										placeholder="Enter one prompt per line, up to 50"
										value={formData.manualPrompts}
										onChange={(e) => setFormData({ ...formData, manualPrompts: e.target.value })}
										disabled={createMutation.isPending}
										rows={6}
										className="font-mono text-sm"
									/>
									<p className="text-xs text-muted-foreground">
										{formData.manualPrompts.trim() ? (
											<>
												<strong>Note:</strong> Prompts will NOT be auto-generated. Using your{" "}
												{
													formData.manualPrompts
														.trim()
														.split("\n")
														.filter((line) => line.trim()).length
												}{" "}
												manual prompt
												{formData.manualPrompts
													.trim()
													.split("\n")
													.filter((line) => line.trim()).length !== 1
													? "s"
													: ""}
												.
											</>
										) : (
											"Leave empty to auto-generate prompts based on website analysis, competitors, and keywords."
										)}
									</p>
								</div>

								{submitError && <p className="text-sm text-destructive">{submitError}</p>}
								{success && <p className="text-sm text-green-600">{success}</p>}

								<Button type="submit" disabled={createMutation.isPending} className="cursor-pointer">
									{createMutation.isPending ? "Creating Report..." : "Create Report"}
								</Button>
							</form>
						</div>

						<div className="space-y-4">
							<h2 className="text-2xl font-semibold">Report History</h2>

							{error && (
								<Card>
									<CardContent className="py-8 text-center">
										<p className="text-destructive">
											{error instanceof Error ? error.message : "Failed to load reports"}
										</p>
									</CardContent>
								</Card>
							)}

							{isLoading ? (
								<div className="flex items-center justify-center py-8">
									<div className="flex items-center space-x-2">
										<Spinner className="size-6 text-primary" />
										<span>Loading reports...</span>
									</div>
								</div>
							) : !error && reports.length === 0 ? (
								<Card>
									<CardContent className="py-8 text-center">
										<p className="text-muted-foreground">No reports found.</p>
									</CardContent>
								</Card>
							) : (
								!error && (
									<div className="space-y-3">
										{reports.map((report: any) => (
											<div key={report.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
												<div className="flex items-center justify-between">
													<div className="flex-1 min-w-0">
														<h3 className="font-semibold text-lg">
															{report.brandName}{" "}
															<span className="text-gray-600 font-normal">({extractDomain(report.brandWebsite)})</span>
														</h3>
													</div>
													<div className="ml-4">
														{report.status === "completed" ? (
															<Link
																to="/reports/render/$reportId"
																params={{
																	reportId: report.id,
																}}
																target="_blank"
															>
																<Button variant="default" size="sm" className="cursor-pointer h-6 px-2 text-xs">
																	<ExternalLink className="size-3 mr-0.5" />
																	View Report
																</Button>
															</Link>
														) : (
															<Badge variant={getStatusBadgeVariant(report.status)} className="text-xs">
																{report.status.charAt(0).toUpperCase() + report.status.slice(1)}
															</Badge>
														)}
													</div>
												</div>
											</div>
										))}
									</div>
								)
							)}
						</div>
					</div>
				</div>
			</PageContent>
		</AppShell>
	);
}
