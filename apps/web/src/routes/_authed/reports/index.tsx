/**
 * /reports - Reports list page
 *
 * Requires admin OR report generator access.
 * Replicates: apps/web/src/app/reports/page.tsx + reports-content.tsx
 */
import { useState } from "react";
import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { getAppName } from "@/lib/route-head";
import { createServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SidebarProvider, SidebarInset } from "@workspace/ui/components/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Textarea } from "@workspace/ui/components/textarea";
import { Card, CardContent } from "@workspace/ui/components/card";
import { Badge } from "@workspace/ui/components/badge";
import { trackEvent } from "@/lib/posthog";
import { ExternalLink } from "lucide-react";
import { requireAuthSession, isAdmin, hasReportAccess } from "@/lib/auth/helpers";
import { getReportsFn, createReportFn } from "@/server/reports";
import { formatNumber } from "@/i18n/formatting";
import * as m from "@/paraglide/messages.js";

const checkReportAccess = createServerFn({ method: "GET" }).handler(
	async (): Promise<{
		hasAccess: boolean;
		isAdmin: boolean;
		hasReportAccess: boolean;
	}> => {
		const session = await requireAuthSession();
		const admin = isAdmin(session);
		const reportAccess = hasReportAccess(session);
		return {
			hasAccess: admin || reportAccess,
			isAdmin: admin,
			hasReportAccess: reportAccess,
		};
	},
);

export const Route = createFileRoute("/_authed/reports/")({
	head: ({ match }) => {
		const appName = getAppName(match);
		return {
			meta: [
				{ title: `${m.reports_title()} · ${appName}` },
				{ name: "description", content: m.reports_description() },
			],
		};
	},
	beforeLoad: async () => {
		const { hasAccess, isAdmin, hasReportAccess } = await checkReportAccess();
		if (!hasAccess) throw notFound();
		return { isAdmin, hasReportAccess };
	},
	component: ReportsPage,
});

function ReportsPage() {
	const { isAdmin, hasReportAccess } = Route.useRouteContext();
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
			setSuccess(m.reports_submitted());
			setFormData({ brandName: "", brandWebsite: "", manualPrompts: "" });
			queryClient.invalidateQueries({ queryKey: ["reports"] });
		},
		onError: (err: Error) => {
			setSubmitError(err.message || m.common_error());
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

	const getStatusLabel = (status: string) => {
		switch (status) {
			case "completed": return m.status_completed();
			case "processing": return m.status_processing();
			case "failed": return m.status_failed();
			default: return m.status_pending();
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
		<SidebarProvider>
			<AppSidebar isAdmin={isAdmin} hasReportAccess={hasReportAccess} adminOnly />
			<SidebarInset className="md:border md:border-border/60 md:rounded-xl overflow-hidden">
				<SiteHeader />
				<div className="flex flex-1 flex-col">
					<div className="@container/main flex flex-1 flex-col gap-2">
						<div className="flex flex-col gap-4 p-4 md:gap-6 md:p-6">
							<div className="space-y-8">
								<div className="space-y-2">
									<h1 className="text-3xl font-bold tracking-tight">{m.reports_title()}</h1>
									<p className="text-muted-foreground">{m.reports_short_description()}</p>
								</div>
								<div className="space-y-6 max-w-4xl">
									{/* Report Creation Form */}
									<div className="space-y-4">
										<h2 className="text-2xl font-semibold">{m.reports_create()}</h2>

										<form onSubmit={handleSubmit} className="space-y-4">
											<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
												<div className="space-y-2">
												<Label htmlFor="brandName">{m.reports_brand_name()}</Label>
													<Input
														id="brandName"
														type="text"
													placeholder={m.reports_enter_brand()}
														value={formData.brandName}
														onChange={(e) => setFormData({ ...formData, brandName: e.target.value })}
														required
														disabled={createMutation.isPending}
													/>
												</div>
												<div className="space-y-2">
												<Label htmlFor="brandWebsite">{m.reports_brand_website()}</Label>
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
												{m.reports_manual_prompts()} <span className="text-muted-foreground font-normal">({m.common_optional()})</span>
												</Label>
												<Textarea
													id="manualPrompts"
											placeholder={m.reports_manual_placeholder()}
													value={formData.manualPrompts}
													onChange={(e) => setFormData({ ...formData, manualPrompts: e.target.value })}
													disabled={createMutation.isPending}
													rows={6}
													className="font-mono text-sm"
												/>
												<p className="text-xs text-muted-foreground">
													{formData.manualPrompts.trim() ? (
												m.reports_manual_note({ count: formatNumber(formData.manualPrompts.trim().split("\n").filter((line) => line.trim()).length) })
													) : (
												m.reports_auto_note()
													)}
												</p>
											</div>

											{submitError && <p className="text-sm text-destructive">{submitError}</p>}
											{success && <p className="text-sm text-green-600">{success}</p>}

											<Button type="submit" disabled={createMutation.isPending} className="cursor-pointer">
										{createMutation.isPending ? m.reports_creating() : m.reports_create_button()}
											</Button>
										</form>
									</div>

									{/* Reports List */}
									<div className="space-y-4">
									<h2 className="text-2xl font-semibold">{m.reports_history()}</h2>

										{error && (
											<Card>
												<CardContent className="py-8 text-center">
													<p className="text-destructive">
											{error instanceof Error ? error.message : m.reports_load_failed()}
													</p>
												</CardContent>
											</Card>
										)}

										{isLoading ? (
											<div className="flex items-center justify-center py-8">
												<div className="flex items-center space-x-2">
													<div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
											<span>{m.reports_loading()}</span>
												</div>
											</div>
										) : !error && reports.length === 0 ? (
											<Card>
												<CardContent className="py-8 text-center">
											<p className="text-muted-foreground">{m.reports_none()}</p>
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
																		<span className="text-gray-600 font-normal">
																			({extractDomain(report.brandWebsite)})
																		</span>
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
													{m.reports_view()}
																			</Button>
																		</Link>
																	) : (
																		<Badge variant={getStatusBadgeVariant(report.status)} className="text-xs">
											{getStatusLabel(report.status)}
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
						</div>
					</div>
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
