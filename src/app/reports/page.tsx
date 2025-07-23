"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Save } from "lucide-react";
import type { Report } from "@/lib/db/schema";

interface ReportFormData {
	brandName: string;
	brandWebsite: string;
}

const fetcher = async (url: string) => {
	const response = await fetch(url);
	if (!response.ok) {
		if (response.status === 403) {
			throw new Error("Access denied. You don't have permission to view reports.");
		}
		throw new Error("Failed to load reports");
	}
	return response.json();
};

export default function ReportPage() {
	const { data: reports = [], error, isLoading } = useSWR<Report[]>("/api/reports", fetcher, {
		refreshInterval: 5000, // Auto-refresh every 5 seconds
		revalidateOnFocus: true,
		revalidateOnReconnect: true,
	});

	const [isSubmitting, setIsSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState("");
	const [success, setSuccess] = useState("");
	const [downloadError, setDownloadError] = useState("");
	const [formData, setFormData] = useState<ReportFormData>({
		brandName: "",
		brandWebsite: "",
	});

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsSubmitting(true);
		setSubmitError("");
		setSuccess("");

		try {
			const response = await fetch("/api/reports", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(formData),
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to create report");
			}

			setSuccess("Report created successfully!");
			setFormData({ brandName: "", brandWebsite: "" });
			// Trigger immediate revalidation of the reports list
			mutate("/api/reports");
		} catch (err) {
			setSubmitError(err instanceof Error ? err.message : "An error occurred");
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleDownloadPDF = async (reportId: string, brandName: string) => {
		try {
			setDownloadError("");
			const response = await fetch(`/api/reports/download/${reportId}`, {
				method: "GET",
			});

			if (!response.ok) {
				if (response.status === 403) {
					setDownloadError("Access denied. You don't have permission to download reports.");
				} else {
					const errorData = await response.json();
					setDownloadError(errorData.error || "Failed to download report");
				}
				return;
			}

			// Create blob from response
			const blob = await response.blob();
			const url = window.URL.createObjectURL(blob);
			
			// Create temporary download link
			const link = document.createElement("a");
			link.href = url;
			link.download = `${brandName.replace(/[^a-zA-Z0-9]/g, "_")}_report.pdf`;
			document.body.appendChild(link);
			link.click();
			
			// Cleanup
			document.body.removeChild(link);
			window.URL.revokeObjectURL(url);
		} catch (err) {
			setDownloadError("Failed to download report");
		}
	};

	const getStatusBadgeVariant = (status: string) => {
		switch (status) {
			case "completed":
				return "default";
			case "processing":
				return "secondary";
			case "failed":
				return "destructive";
			default:
				return "outline";
		}
	};

	const extractDomain = (url: string) => {
		try {
			return new URL(url).hostname.replace('www.', '');
		} catch {
			return url;
		}
	};

	return (
		<div className="space-y-6 max-w-4xl">

			{/* Report Creation Form */}
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
								disabled={isSubmitting}
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
								disabled={isSubmitting}
							/>
						</div>
					</div>

					{submitError && <p className="text-sm text-destructive">{submitError}</p>}
					{success && <p className="text-sm text-green-600">{success}</p>}

					<Button type="submit" disabled={isSubmitting} className="cursor-pointer">
						{isSubmitting ? "Creating Report..." : "Create Report"}
					</Button>
				</form>
			</div>

			{/* Reports List */}
			<div className="space-y-4">
				<h2 className="text-2xl font-semibold">Report History</h2>

				{/* Display fetch errors */}
				{error && (
					<Card>
						<CardContent className="py-8 text-center">
							<p className="text-destructive">{error.message}</p>
						</CardContent>
					</Card>
				)}

				{/* Display download errors */}
				{downloadError && (
					<div className="bg-destructive/10 border border-destructive/20 rounded-md p-3">
						<p className="text-sm text-destructive">{downloadError}</p>
					</div>
				)}

				{isLoading ? (
					<div className="flex items-center justify-center py-8">
						<div className="flex items-center space-x-2">
							<div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
							<span>Loading reports...</span>
						</div>
					</div>
				) : !error && reports.length === 0 ? (
					<Card>
						<CardContent className="py-8 text-center">
							<p className="text-muted-foreground">No reports found.</p>
						</CardContent>
					</Card>
				) : !error && (
					<div className="space-y-3">
						{reports.map((report) => (
							<div 
								key={report.id} 
								className="bg-gray-50 border border-gray-200 rounded-lg p-4"
							>
								<div className="flex items-center justify-between">
									<div className="flex-1 min-w-0">
										<h3 className="font-semibold text-lg">
											{report.brandName}{" "}
											<span className="text-gray-600 font-normal">({extractDomain(report.brandWebsite)})</span>
										</h3>
									</div>
									<div className="ml-4">
										{report.status === "completed" ? (
											<Button
												variant="default"
												size="sm"
												onClick={() => handleDownloadPDF(report.id, report.brandName)}
												className="cursor-pointer h-6 px-2 text-xs"
											>
												<Save className="w-3 h-3 mr-1" />
												Download
											</Button>
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
				)}
			</div>
		</div>
	);
} 